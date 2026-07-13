/**
 * Kafka audit + cost consumer.
 *
 * One Kafka consumer instance subscribes to every topic the producer
 * writes to and does two jobs:
 *
 *   1. AUDIT — every message is appended to logs/kafka-audit.jsonl
 *      (one JSON line per event, prefixed with topic + partition + offset
 *      + ingested-at). Bounded log rotation: when the file passes
 *      AUDIT_ROTATE_MB it's renamed to .1 and a new one starts.
 *
 *   2. COST — model.responses events get summed into per-agent +
 *      per-model totals using the MODEL_COSTS table from token-tracker.
 *      State is in-memory + flushed to data/kafka-cost.json every minute
 *      so a virtualpc restart doesn't lose the running totals.
 *
 * Boot path: src/index.ts calls startAuditConsumer() once. Idempotent.
 * Disconnect path is best-effort on SIGTERM.
 */

import { Kafka, Consumer } from 'kafkajs';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../../utils/logger';
import { MODEL_COSTS } from '../../token-tracker';

const BROKERS  = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const GROUP_ID = process.env.KAFKA_AUDIT_GROUP || 'virtualpc-audit';
// Read lazily because deployment/runtime config may be injected after import.
function isKafkaDisabled(): boolean {
  return /^(1|true|yes)$/i.test(process.env.KAFKA_DISABLED || '');
}
const TOPICS = [
  'agent.tasks', 'agent.results',
  'model.requests', 'model.responses',
  'lightrag.updates', 'cost.tracking', 'system.health',
];

const LOG_DIR = path.resolve(__dirname, '..', '..', '..', 'logs');
const AUDIT_FILE = path.join(LOG_DIR, 'kafka-audit.jsonl');
const COST_FILE  = path.resolve(__dirname, '..', '..', '..', 'data', 'kafka-cost.json');
const AUDIT_ROTATE_MB = parseInt(process.env.KAFKA_AUDIT_ROTATE_MB || '256');

// In-memory cost aggregates. Keys: 'agent', 'model', 'agent:model', plus
// 'total' rolled across everything. Each entry tracks lifetime spend +
// today's spend (UTC day key).
interface CostBucket {
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  calls: number;
  tier: 1 | 2 | 3;
  last_seen: string;
}
interface CostState {
  byAgent: Record<string, CostBucket>;
  byModel: Record<string, CostBucket>;
  byPair:  Record<string, CostBucket>;     // 'agent::model'
  byDay:   Record<string, CostBucket>;     // YYYY-MM-DD
  total:   CostBucket;
  lastFlushed: string | null;
}

const newBucket = (tier: 1|2|3 = 1): CostBucket => ({
  prompt_tokens: 0, completion_tokens: 0, cost_usd: 0, calls: 0,
  tier, last_seen: new Date().toISOString(),
});

let costState: CostState = {
  byAgent: {}, byModel: {}, byPair: {}, byDay: {},
  total: newBucket(),
  lastFlushed: null,
};

function loadCost(): void {
  try {
    if (fs.existsSync(COST_FILE)) {
      costState = JSON.parse(fs.readFileSync(COST_FILE, 'utf8'));
      logger.info(`Kafka cost consumer: restored aggregates (${costState.total.calls} historical calls)`);
    }
  } catch (e: any) {
    logger.warn(`Kafka cost: load failed (starting fresh): ${e.message}`);
  }
}

function flushCost(): void {
  try {
    if (!fs.existsSync(path.dirname(COST_FILE))) fs.mkdirSync(path.dirname(COST_FILE), { recursive: true });
    costState.lastFlushed = new Date().toISOString();
    const tmp = COST_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(costState));
    fs.renameSync(tmp, COST_FILE);
  } catch (e: any) {
    logger.warn(`Kafka cost: flush failed: ${e.message}`);
  }
}

// Resolve a tier+pricing entry given a possibly-prefixed LM Studio model id.
// LM Studio returns ids like 'mistralai/devstral-small-2-2512' or
// 'google/gemma-4-26b-a4b' but our MODEL_COSTS table uses short names
// ('devstral', 'gemma-4-26b', 'claude-sonnet'). Substring-match so cost
// rollups attribute to the right tier instead of defaulting to tier 1 / $0.
function resolveModelCost(model: string): { prompt: number; completion: number; tier: 1|2|3 } {
  if (MODEL_COSTS[model]) return MODEL_COSTS[model];
  const lower = model.toLowerCase();
  // Most-specific first so 'claude-opus' wins over a hypothetical 'claude' key.
  for (const key of Object.keys(MODEL_COSTS).sort((a, b) => b.length - a.length)) {
    if (lower.includes(key)) return MODEL_COSTS[key];
  }
  return { prompt: 0, completion: 0, tier: 1 as 1|2|3 };
}

function bumpBucket(b: CostBucket, prompt: number, completion: number, model: string): void {
  const mc = resolveModelCost(model);
  b.prompt_tokens     += prompt;
  b.completion_tokens += completion;
  b.cost_usd          += (prompt / 1000) * mc.prompt + (completion / 1000) * mc.completion;
  b.calls             += 1;
  b.tier               = mc.tier;
  b.last_seen          = new Date().toISOString();
}

function processModelResponse(payload: any): void {
  const model  = payload.model || 'unknown';
  const agent  = payload.agent || payload.tag_agent || 'unknown';
  const prompt     = Number(payload.tokens_prompt || payload.prompt_tokens || 0);
  const completion = Number(payload.tokens_completion || payload.completion_tokens || 0);
  const today  = new Date().toISOString().slice(0, 10);
  const pair   = `${agent}::${model}`;

  costState.byAgent[agent] ||= newBucket();
  costState.byModel[model] ||= newBucket();
  costState.byPair[pair]   ||= newBucket();
  costState.byDay[today]   ||= newBucket();

  bumpBucket(costState.byAgent[agent], prompt, completion, model);
  bumpBucket(costState.byModel[model], prompt, completion, model);
  bumpBucket(costState.byPair[pair],   prompt, completion, model);
  bumpBucket(costState.byDay[today],   prompt, completion, model);
  bumpBucket(costState.total,          prompt, completion, model);
}

// --- Audit JSONL writer with size-based rotation ----------------------------
function writeAudit(topic: string, partition: number, offset: string, payload: any): void {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    if (fs.existsSync(AUDIT_FILE)) {
      const sizeMb = fs.statSync(AUDIT_FILE).size / (1024 * 1024);
      if (sizeMb > AUDIT_ROTATE_MB) {
        try { fs.renameSync(AUDIT_FILE, AUDIT_FILE + '.1'); }
        catch { /* non-fatal */ }
      }
    }
    fs.appendFileSync(AUDIT_FILE,
      JSON.stringify({ ts: new Date().toISOString(), topic, partition, offset, payload }) + '\n');
  } catch (e: any) {
    // Never let audit-write errors take down the consumer.
    logger.warn(`Kafka audit append failed: ${e.message}`);
  }
}

// --- Consumer lifecycle -----------------------------------------------------
let _consumer: Consumer | null = null;
let _running = false;

export async function startAuditConsumer(): Promise<void> {
  if (_running) return;
  if (isKafkaDisabled()) {
    logger.info('Kafka audit consumer disabled via KAFKA_DISABLED=1 — audit log will not be populated');
    loadCost();  // still expose any previously-flushed cost totals via the API
    return;
  }
  loadCost();

  const kafka = new Kafka({
    clientId: 'virtualpc-audit',
    brokers: BROKERS,
    retry: { initialRetryTime: 1000, retries: 5 },
  });
  _consumer = kafka.consumer({ groupId: GROUP_ID, sessionTimeout: 30_000 });

  try {
    await _consumer.connect();
    for (const topic of TOPICS) {
      await _consumer.subscribe({ topic, fromBeginning: false });
    }
    _running = true;
    logger.info(`✓ Kafka audit consumer subscribed to ${TOPICS.length} topics (group=${GROUP_ID})`);

    await _consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        let payload: any = null;
        try { payload = message.value ? JSON.parse(message.value.toString()) : null; }
        catch { payload = { _raw: message.value?.toString() }; }
        writeAudit(topic, partition, String(message.offset), payload);
        if (topic === 'model.responses' && payload) processModelResponse(payload);
      },
    });
  } catch (e: any) {
    logger.warn(`Kafka audit consumer connect failed (will retry on next service restart): ${e.message}`);
    _running = false;
  }
}

export async function stopAuditConsumer(): Promise<void> {
  if (_consumer && _running) {
    try { await _consumer.disconnect(); } catch {}
    _running = false;
  }
}
process.once('SIGTERM', () => { flushCost(); stopAuditConsumer(); });
process.once('SIGINT',  () => { flushCost(); stopAuditConsumer(); });

// Periodic flush so a SIGKILL still preserves aggregates within 1 min.
setInterval(flushCost, 60_000);

// --- Read APIs --------------------------------------------------------------
export function getCostState() { return costState; }

export function readAuditTail(limit = 50): any[] {
  try {
    if (!fs.existsSync(AUDIT_FILE)) return [];
    const lines = fs.readFileSync(AUDIT_FILE, 'utf8').trimEnd().split('\n');
    return lines.slice(-limit)
      .map(l => { try { return JSON.parse(l); } catch { return { _bad: l }; } });
  } catch (e: any) {
    return [{ _error: e.message }];
  }
}

export function isAuditConsumerRunning(): boolean { return _running; }
