/**
 * LM Studio agent-inference backend.
 *
 * Thin wrapper around the OpenAI-compatible API at http://127.0.0.1:1234/v1.
 * Model selection is delegated to src/model-router.ts; time-slot sharing is
 * handled by src/model-scheduler.ts.  VirtualPC always tries to use a real
 * model.  Simulation is only used when FORCE_SIMULATE=1.
 */

import logger from './utils/logger';
import { execFile } from 'child_process';
import { bestEffortPublish } from './integrations/kafka/shared';
import { secretOrEnv } from './security/secretsBootstrap';
import * as modelRouter from './model-router';
import * as modelScheduler from './model-scheduler';
import * as modelDownloader from './model-downloader';

// Lazy-imported to avoid the chicken-and-egg between token-tracker (also
// imports from agent-registry like this module does). Re-imported inside
// the recordRealCall fn so the module's events array is shared.

// Most-recent measurement per agent. Updated on every successful chatAsAgent
// call so the dashboard can show "live tok/s" without re-running benchmarks.
// Persists in-process; resets on virtualpc restart.
const lastThroughput: Record<string, { tokensPerSec: number; model: string; promptTokens: number; completionTokens: number; latencyMs: number; ts: string }> = {};
export function getLastThroughput() { return { ...lastThroughput }; }
function recordThroughput(agent: string, model: string, usage: any, latencyMs: number) {
  const completion = usage?.completion_tokens ?? 0;
  const prompt = usage?.prompt_tokens ?? 0;
  const tps = latencyMs > 0 ? (completion / (latencyMs / 1000)) : 0;
  lastThroughput[agent] = {
    tokensPerSec: Math.round(tps * 10) / 10,
    model,
    promptTokens: prompt,
    completionTokens: completion,
    latencyMs,
    ts: new Date().toISOString(),
  };
  // Best-effort feed to the simulated tracker so events page reflects it
  // alongside the simulated stream. Keeps the dashboard's accounting model
  // unchanged; the tracker just gains real entries on top.
  try {
    const tt = require('./token-tracker');
    if (typeof tt.recordRealEvent === 'function') {
      tt.recordRealEvent({ agent, model, promptTokens: prompt, completionTokens: completion });
    }
  } catch { /* tracker unavailable — ignore */ }

  // Publish to Kafka topics for downstream consumers (audit log, cost
  // dashboard, distributed analytics). Fire-and-forget — never blocks the
  // chat response. shared.bestEffortPublish handles broker-down gracefully.
  // The downstream cost consumer reads .agent + .model + .tokens_* fields,
  // so they must be present on every event for the by-agent rollup to work.
  bestEffortPublish(async (p) => {
    await p.publishModelResponse({
      request_id: `${agent}-${Date.now()}`,
      agent,             // explicit field for cost-by-agent aggregation
      model,
      completion: '',    // payload intentionally elided — content is sensitive
      tokens_prompt: prompt,
      tokens_completion: completion,
      cost_usd: 0,       // computed by downstream cost.tracking consumer
      latency_ms: latencyMs,
    });
  });
}

// ─── Kimi CLI bridge ──────────────────────────────────────────────────────
// Shells out to `kimi --quiet -p <prompt>` (Moonshot's paid CLI, installed
// at ~/.local/bin/kimi by the user). Joins messages[] into one prompt so
// the existing call sites don't need to change shape. Prints stdout only;
// the CLI's --quiet flag suppresses the TUI noise.
const KIMI_CLI_PATH = process.env.KIMI_CLI_PATH || (process.env.HOME ? `${process.env.HOME}/.local/bin/kimi` : 'kimi');
const KIMI_TIMEOUT_MS = parseInt(process.env.KIMI_TIMEOUT_MS || '120000');

function flattenMessages(messages: { role: string; content: string }[]): string {
  // kimi --quiet -p takes a single string. Mark roles so the model can
  // tell SYSTEM context from the USER turn.
  return messages.map(m => {
    const r = m.role.toUpperCase();
    return r === 'USER' ? m.content : `[${r}]\n${m.content}`;
  }).join('\n\n');
}

async function chatViaKimiCli(
  messages: { role: string; content: string }[],
  opts: { temperature?: number; max_tokens?: number } = {},
): Promise<{ ok: true; model: string; agent: string; content: string; usage: any; latencyMs: number } | null> {
  const prompt = flattenMessages(messages);
  const started = Date.now();
  return new Promise((resolve) => {
    execFile(KIMI_CLI_PATH, ['--quiet', '-p', prompt], { maxBuffer: 4 * 1024 * 1024, timeout: KIMI_TIMEOUT_MS },
      (err, stdout, stderr) => {
        if (err) {
          // Common cases: ENOENT (CLI not installed for this user/PATH), 124 (timeout), 1 (auth lapse).
          const code = (err as any).code;
          if (code === 'ENOENT') {
            logger.warn(`Kimi CLI not found at ${KIMI_CLI_PATH} — falling back to LM Studio`);
            resolve(null);     // signals caller to fall through
            return;
          }
          logger.warn(`Kimi CLI error (code=${code}): ${(stderr || err.message).slice(0, 200)}`);
          resolve(null);       // graceful fallback
          return;
        }
        // --quiet output also includes a trailing "To resume this session: kimi -r <id>" line.
        // Strip it so the response is clean.
        const cleaned = stdout
          .split('\n')
          .filter(l => !/^\s*To resume this session:/i.test(l))
          .join('\n')
          .trim();
        // Rough token estimate (no usage stats from CLI). 1 token ≈ 4 chars.
        const promptTokens = Math.round(prompt.length / 4);
        const completionTokens = Math.round(cleaned.length / 4);
        resolve({
          ok: true,
          model: 'kimi-k2.6',
          agent: '',                     // filled in by caller
          content: cleaned,
          usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens, source: 'kimi-cli-estimate' },
          latencyMs: Date.now() - started,
        });
      },
    );
  });
}

// ─── Claude CLI bridge (for designer agents) ─────────────────────────────
// Shells out to `claude --bare --print -p <prompt>` so Mira (Creative
// Director) and Luna (Tech Artist) can route their design-flavored work
// to Claude rather than local models. Same shell-out pattern as Kimi.
const CLAUDE_CLI_PATH = process.env.CLAUDE_CLI_PATH || 'claude';
const CLAUDE_TIMEOUT_MS = parseInt(process.env.CLAUDE_TIMEOUT_MS || '120000');
const CLAUDE_MODEL_TAG = process.env.CLAUDE_MODEL_TAG || 'claude-sonnet';
let _claudeAuthChecked = false;
let _claudeAuthOk = false;

function claudeAuthLikelyOk(): boolean {
  if (_claudeAuthChecked) return _claudeAuthOk;
  _claudeAuthChecked = true;
  _claudeAuthOk = !!secretOrEnv('api', 'ANTHROPIC_API_KEY');
  if (!_claudeAuthOk) {
    logger.warn('Claude CLI: ANTHROPIC_API_KEY not set in virtualpc env — designer-agent calls will fall back to local models.');
  }
  return _claudeAuthOk;
}

async function chatViaClaudeCli(
  messages: { role: string; content: string }[],
  opts: { temperature?: number; max_tokens?: number } = {},
): Promise<{ ok: true; model: string; agent: string; content: string; usage: any; latencyMs: number } | null> {
  if (!claudeAuthLikelyOk()) return null;

  const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const userTurn = messages.filter(m => m.role !== 'system').map(m =>
    m.role === 'user' ? m.content : `[ASSISTANT EARLIER]\n${m.content}`).join('\n\n');

  const args = ['--bare', '--print', '-p', userTurn];
  if (sys) args.push('--append-system-prompt', sys);

  const started = Date.now();
  return new Promise((resolve) => {
    execFile(CLAUDE_CLI_PATH, args, { maxBuffer: 8 * 1024 * 1024, timeout: CLAUDE_TIMEOUT_MS },
      (err, stdout, stderr) => {
        if (err) {
          const code = (err as any).code;
          if (code === 'ENOENT') {
            logger.warn(`Claude CLI not found at ${CLAUDE_CLI_PATH} — falling back to local models`);
          } else {
            logger.warn(`Claude CLI error (code=${code}): ${(stderr || err.message).slice(0, 200)}`);
          }
          resolve(null);
          return;
        }
        const cleaned = stdout.trim();
        if (!cleaned || /not logged in|please run \/login/i.test(cleaned)) {
          logger.warn('Claude CLI returned an auth-required message — falling back. Run `claude /login` interactively or export ANTHROPIC_API_KEY.');
          _claudeAuthOk = false;
          resolve(null);
          return;
        }
        const promptText = sys + '\n' + userTurn;
        const promptTokens = Math.round(promptText.length / 4);
        const completionTokens = Math.round(cleaned.length / 4);
        resolve({
          ok: true,
          model: CLAUDE_MODEL_TAG,
          agent: '',
          content: cleaned,
          usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens, source: 'claude-cli-estimate' },
          latencyMs: Date.now() - started,
        });
      },
    );
  });
}

const DESIGNER_AGENTS = new Set(['Mira', 'Luna']);

// Prefer LiteLLM unified gateway when running.
const LITELLM_URL = process.env.LITELLM_URL || '';
const LM_STUDIO_URL = LITELLM_URL || process.env.LM_STUDIO_URL || 'http://127.0.0.1:1234/v1';
const LITELLM_MASTER_KEY = process.env.LITELLM_MASTER_KEY || 'sk-virtualpc-dev';

// Task-type → capability tag.  The actual model is chosen at runtime by
// src/model-router.ts from the loaded LM Studio models.
const TASK_TYPE_ROUTES: { [kind: string]: string } = {
  chat:         'chat',
  code:         'code',
  arbitration:  'reasoning',
  reasoning:    'reasoning',
  cheap:        'chat',
  embedding:    'embedding',
  deep:         process.env.FORCE_BIG_MODEL === '1' ? 'long-context' : 'reasoning',
  concept:      process.env.FORCE_BIG_MODEL === '1' ? 'long-context' : 'chat',
  design:       'claude-sonnet',
  docs:         'claude-sonnet',
};

let _roster: modelRouter.GeneratedRoster | null = null;
function getRoster(): modelRouter.GeneratedRoster {
  if (!_roster) _roster = modelRouter.generateRoster();
  return _roster;
}
export function refreshRoster(opts?: { weightClass?: modelRouter.WeightClass }) {
  _roster = modelRouter.generateRoster(opts);
  return _roster;
}

interface LmModel {
  id: string;
  object: string;
  owned_by?: string;
}

interface LmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LmChatRequest {
  model?: string;
  messages: LmChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: false;
}

interface LmChatResponse {
  id: string;
  model: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

let cachedModels: { at: number; models: LmModel[] } | null = null;
const MODEL_CACHE_MS = 15_000;

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 5000): Promise<T> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (LITELLM_URL && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${LITELLM_MASTER_KEY}`;
  }
  try {
    const r = await fetch(url, { ...init, headers, signal: ctrl.signal });
    if (!r.ok) {
      const provider = LITELLM_URL ? 'LiteLLM' : 'LM Studio';
      throw new Error(`${provider} ${r.status}: ${await r.text()}`);
    }
    return (await r.json()) as T;
  } finally {
    clearTimeout(to);
  }
}

export async function getModels(force = false): Promise<LmModel[]> {
  if (!force && cachedModels && Date.now() - cachedModels.at < MODEL_CACHE_MS) {
    return cachedModels.models;
  }
  try {
    const r = await fetchJson<{ data: LmModel[] }>(`${LM_STUDIO_URL}/models`, undefined, 3000);
    cachedModels = { at: Date.now(), models: r.data || [] };
    return cachedModels.models;
  } catch (e: any) {
    logger.warn(`LM Studio unreachable: ${e.message}`);
    return [];
  }
}

export async function healthCheck(): Promise<{
  reachable: boolean;
  gateway: 'litellm' | 'lm-studio';
  url: string;
  modelsLoaded: number;
  models: string[];
  error?: string;
}> {
  const gateway = LITELLM_URL ? 'litellm' : 'lm-studio';
  try {
    const models = await getModels(true);
    return {
      reachable: true,
      gateway,
      url: LM_STUDIO_URL,
      modelsLoaded: models.length,
      models: models.map(m => m.id),
    };
  } catch (e: any) {
    return {
      reachable: false,
      gateway,
      url: LM_STUDIO_URL,
      modelsLoaded: 0,
      models: [],
      error: e.message,
    };
  }
}

/** Legacy helper: pick any loaded model matching a substring hint.
 *  Kept for callers that still pass raw hints; chatAsAgent now prefers
 *  modelRouter.resolveModelForAgent.
 */
async function resolveModel(hint: string): Promise<string | null> {
  const models = await getModels();
  if (models.length === 0) return null;
  const lower = hint.toLowerCase();
  const match = models.find(m => m.id.toLowerCase().includes(lower));
  if (match) return match.id;
  const preferredFallback = ['smollm', 'qwen2.5-0.5b', 'tinyllama', 'phi-4-mini', 'phi-4', 'deepseek-r1', 'gemma'];
  for (const p of preferredFallback) {
    const found = models.find(m => m.id.toLowerCase().includes(p));
    if (found) return found.id;
  }
  const fallback = models.find(m => !/embed/i.test(m.id));
  return fallback?.id || null;
}

export async function chatAsAgent(
  agent: string,
  messages: LmChatMessage[],
  opts: { temperature?: number; max_tokens?: number; taskType?: keyof typeof TASK_TYPE_ROUTES } = {}
): Promise<{ ok: true; model: string; agent: string; content: string; usage: any; latencyMs: number }
         | { ok: false; reason: string; hint?: string }> {
  // Kimi agent has its own paid CLI subscription — bypass LM Studio entirely.
  if (agent === 'Kimi') {
    const r = await chatViaKimiCli(messages, opts);
    if (r) {
      recordThroughput(agent, r.model, r.usage, r.latencyMs);
      return { ...r, agent };
    }
  }

  // Designer / docs tasks try Claude CLI first.
  const kamiForDocs = process.env.KAMI_FOR_DOCS !== '0';
  const isDocsTask = opts.taskType === 'docs' && kamiForDocs;
  let designerFallthroughHint: string | null = null;
  let docsFallthroughHint: string | null = null;
  const claudeRouted = DESIGNER_AGENTS.has(agent) && (opts.taskType === 'design' || process.env.CLAUDE_FOR_DESIGNERS === '1');
  if (claudeRouted || isDocsTask) {
    const r = await chatViaClaudeCli(messages, opts);
    if (r) {
      recordThroughput(agent, r.model, r.usage, r.latencyMs);
      return { ...r, agent };
    }
    // No Claude auth — fall back to the lightest local chat model.
    const roster = getRoster();
    const entry = roster.roster.find(e => e.agent === agent);
    const light = entry?.models.find(id => !id.startsWith('claude'));
    if (isDocsTask) {
      docsFallthroughHint = light || 'smollm-135m';
      logger.info(`Claude CLI unavailable — docs task for ${agent} falling back to ${docsFallthroughHint} (no Kami styling)`);
    }
    if (claudeRouted) {
      designerFallthroughHint = light || 'smollm-135m';
      logger.info(`Claude CLI unavailable — designer ${agent} falling back to ${designerFallthroughHint}`);
    }
  }

  // Build a model hint for the router.  For 'claude-sonnet' we bypass LM Studio
  // because it is a cloud model; otherwise we pass a capability tag.
  let hint: string;
  if (docsFallthroughHint || designerFallthroughHint) {
    hint = (docsFallthroughHint || designerFallthroughHint)!;
  } else if (opts.taskType) {
    hint = TASK_TYPE_ROUTES[opts.taskType] || 'chat';
  } else {
    hint = 'chat';
  }

  let models = await getModels();
  const roster = getRoster();

  // Opt-in simulation only.
  if (modelRouter.shouldSimulate(roster)) {
    const sim = modelRouter.simulateAgentResponse(agent, messages);
    recordThroughput(agent, sim.model, sim.usage, sim.latencyMs);
    logger.info(`FORCE_SIMULATE active — simulating response for ${agent}`);
    return { ok: true, ...sim, agent };
  }

  // Cloud-only route (designer/docs) already tried Claude CLI above and failed.
  // We now surface that as an error so the user sees the auth problem.
  if (hint === 'claude-sonnet') {
    return {
      ok: false,
      reason: 'Cloud route (Claude) selected but Claude CLI is not authenticated. Run `claude /login` or set ANTHROPIC_API_KEY.',
      hint: 'Alternatively load a local model: ' + modelDownloader.recommendedLoadCommands().join('; '),
    };
  }

  // If no models are loaded, try to auto-download the smallest fitting one.
  if (models.length === 0) {
    logger.info(`model-scheduler: no models loaded for ${agent}; attempting auto-download`);
    const dl = await modelDownloader.ensureLocalModel();
    if (dl.ok) {
      models = await getModels(true);
    } else {
      logger.warn(`model-downloader: ${dl.message}`);
    }
  }

  let model: string | null = modelRouter.resolveModelForAgent(agent, hint, models, roster);

  if (!model) {
    const health = await healthCheck();
    if (!health.reachable) {
      return {
        ok: false,
        reason: 'LM Studio server is unreachable and no cloud fallback is available.',
        hint: 'Start LM Studio, or install the LM Studio CLI and run: ' + modelDownloader.recommendedLoadCommands().join('; '),
      };
    }
    return {
      ok: false,
      reason: `No matching model is loaded for ${agent} (${hint}).`,
      hint: 'Load one with: ' + modelDownloader.recommendedLoadCommands().join('; '),
    };
  }

  // Reserve a time slot for this model.  If every capable model is busy, the
  // scheduler may return a busy model so agents share it.
  const preferred = roster.roster.find(e => e.agent === agent)?.models ?? [];
  const reservedModel = modelScheduler.reserveModel(agent, hint, preferred, models);
  if (reservedModel) {
    model = reservedModel;
  }

  const started = Date.now();
  const attemptChat = async (useModel: string): Promise<LmChatResponse> => {
    const req: LmChatRequest = {
      model: useModel,
      messages,
      temperature: opts.temperature ?? 0.6,
      max_tokens: opts.max_tokens ?? 512,
      stream: false,
    };
    return await fetchJson<LmChatResponse>(
      `${LM_STUDIO_URL}/chat/completions`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) },
      60_000
    );
  };

  try {
    const r = await attemptChat(model);
    const latencyMs = Date.now() - started;
    recordThroughput(agent, model, r.usage, latencyMs);
    return {
      ok: true,
      model,
      agent,
      content: r.choices[0]?.message?.content || '',
      usage: r.usage || null,
      latencyMs,
    };
  } catch (e: any) {
    const msg = e.message || '';
    const looksLikeOOM = /out of memory|oom|cuda allocator|allocation failed|insufficient memory/i.test(msg);
    const looksLikeLoadFailure = /Failed to load model|Operation canceled|unload|not yet loaded/i.test(msg);

    if (looksLikeOOM) {
      const wait = 15000;
      logger.warn(`LM Studio VRAM pressure on ${model} — waiting ${wait/1000}s, then retrying original model once`);
      await new Promise(r => setTimeout(r, wait));
      try {
        const r = await attemptChat(model);
        const latencyMs = Date.now() - started;
        recordThroughput(agent, model, r.usage, latencyMs);
        logger.info(`LM Studio retry-after-OOM: ${model} succeeded after wait`);
        return {
          ok: true, model, agent,
          content: r.choices[0]?.message?.content || '',
          usage: r.usage || null,
          latencyMs,
        };
      } catch (e2: any) {
        e = e2;
      }
    }

    if (looksLikeLoadFailure || looksLikeOOM) {
      const fallbackModel = await resolveModel('smollm-135m');
      if (fallbackModel && fallbackModel !== model) {
        try {
          const r = await attemptChat(fallbackModel);
          const latencyMs = Date.now() - started;
          recordThroughput(agent, fallbackModel, r.usage, latencyMs);
          logger.info(`LM Studio fallback: ${model} failed, served via ${fallbackModel}`);
          return {
            ok: true,
            model: fallbackModel,
            agent,
            content: r.choices[0]?.message?.content || '',
            usage: r.usage || null,
            latencyMs,
          };
        } catch (e2: any) {
          return {
            ok: false,
            reason: `Both ${model} and fallback ${fallbackModel} failed. Last: ${e2.message}`,
            hint: 'Check LM Studio logs and load a smaller model.',
          };
        }
      }
    }

    return {
      ok: false,
      reason: `LM Studio error for ${agent}: ${msg}`,
      hint: 'Check `lms server status` and `lms ps`',
    };
  } finally {
    modelScheduler.releaseReservation(model);
  }
}

export function getSchedule() { return modelScheduler.getSchedule(); }
export function extendModelReservation(modelId: string, extraMs: number) { return modelScheduler.extendReservation(modelId, extraMs); }

/** Build a system prompt that grounds the agent in their VirtualPC role. */
export function systemPromptForAgent(agent: string, role: string, context?: string): string {
  return [
    `You are ${agent}, ${role}, an agent inside the VirtualPC multi-agent system.`,
    `Respond in character. Keep answers grounded in VirtualPC context. Be concise unless asked to expand.`,
    context ? `\nCurrent context:\n${context}` : '',
  ].filter(Boolean).join('\n');
}
