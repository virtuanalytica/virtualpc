/**
 * ClaudeClaw Core - Dominant orchestration core with audit trail + judging LLM
 *
 * Integrates fillslava's ClaudeClaw patterns into virtualpc:
 *   generate (worker LLM) -> judge (independent judging LLM) -> audit (JSONL trail)
 *
 * Anti-hallucination design:
 *   - The judge is a DIFFERENT model than the worker (deepseek-r1:8b by default),
 *     mirroring ClaudeClaw's LLM-judge validation mode (position-blinded scoring).
 *   - Outputs below the acceptance threshold are rejected and optionally retried
 *     on the next model tier.
 *   - Every request/response/verdict is appended to an append-only audit log.
 *
 * Model tiers (all local Ollama, upgradeable to paid models later):
 *   light    hermes3:3b        cheap triage / short tasks
 *   standard hermes3:8b        default worker
 *   coder    qwen2.5-coder:7b  code generation
 *   judge    deepseek-r1:8b    reasoning judge (never used as worker)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import logger from '../../utils/logger';
import OllamaClient, { InferenceRequest, InferenceResponse } from '../local-inference/ollama-client';
import { getGovernor } from '../local-inference/throughput-governor';

export type ModelTier = 'light' | 'standard' | 'coder' | 'judge';

export interface ClaudeClawCoreConfig {
  ollamaBaseUrl?: string;
  /** Per-inference wall clock cap. Default 360s (CPU-only inference is slow). */
  ollamaTimeoutMs?: number;
  auditDir?: string;
  models?: Partial<Record<ModelTier, string>>;
  /** Judge score in [0,1] below which output is rejected. Default 0.6 */
  acceptThreshold?: number;
  /** Retry rejected output on the next-heavier tier. Default true */
  escalateOnReject?: boolean;
}

export interface GenerateRequest {
  prompt: string;
  system?: string;
  tier?: ModelTier;
  maxTokens?: number;
  /** Skip the judge (fast path, still audited). Default false */
  skipJudge?: boolean;
  /** Free-form tag for the audit trail (e.g. 'knitweb-dev') */
  context?: string;
}

export interface JudgeVerdict {
  score: number; // 0..1
  accepted: boolean;
  reasoning: string;
  judgeModel: string;
  hallucinationFlags: string[];
}

export interface CoreResult {
  id: string;
  output: string;
  model: string;
  tier: ModelTier;
  verdict: JudgeVerdict | null;
  escalations: number;
  latencyMs: number;
  auditPath: string;
}

const DEFAULT_MODELS: Record<ModelTier, string> = {
  light: 'hermes3:3b',
  standard: 'hermes3:8b',
  coder: 'qwen2.5-coder:7b',
  judge: 'deepseek-r1:8b',
};

const ESCALATION_ORDER: ModelTier[] = ['light', 'standard', 'coder'];

export const JUDGE_SYSTEM = `You are a strict output judge. Evaluate the ASSISTANT OUTPUT against the ORIGINAL PROMPT.
Score dimensions: factual grounding (no invented facts), completeness, instruction-following.
Respond with ONLY a JSON object, no other text:
{"score": <0.0-1.0>, "hallucination_flags": ["<short flag>", ...], "reasoning": "<one sentence>"}
Flag as hallucination: invented APIs/files/numbers, unsupported claims stated as fact, contradictions with the prompt.`;

export class ClaudeClawCore {
  private ollama: OllamaClient;
  private ollamaTimeoutMs: number;
  private models: Record<ModelTier, string>;
  private auditDir: string;
  private acceptThreshold: number;
  private escalateOnReject: boolean;

  constructor(config: ClaudeClawCoreConfig = {}) {
    this.ollamaTimeoutMs = config.ollamaTimeoutMs ?? 360_000;
    this.ollama = new OllamaClient(config.ollamaBaseUrl);
    this.models = { ...DEFAULT_MODELS, ...(config.models || {}) };
    this.auditDir =
      config.auditDir || path.join(process.cwd(), 'data', 'claudeclaw');
    this.acceptThreshold = config.acceptThreshold ?? 0.6;
    this.escalateOnReject = config.escalateOnReject ?? true;
    fs.mkdirSync(this.auditDir, { recursive: true });
  }

  async health(): Promise<boolean> {
    return this.ollama.checkHealth();
  }

  /**
   * Ollama inference through the shared throughput governor: every local
   * consumer draws from one stream budget so concurrent agents can't
   * starve each other below the configured tokens/sec floor. Model choice
   * stays with the tier ladder; the governor only meters concurrency and
   * learns measured t/s.
   */
  private async gatedInfer(req: InferenceRequest): Promise<InferenceResponse> {
    const governor = getGovernor();
    const slot = await governor.acquireSlot(this.ollamaTimeoutMs * 2);
    try {
      const resp = await this.ollama.infer(req);
      const completionTokens = resp.usage?.completion_tokens || 0;
      const tps = completionTokens > 0 && resp.latency_ms > 0
        ? (completionTokens * 1000) / resp.latency_ms
        : 0;
      if (tps > 0) {
        governor.recordMeasurement(req.model, tps, slot.concurrent);
      }
      return resp;
    } finally {
      slot.release();
    }
  }

  /**
   * Dominant core entrypoint: generate -> judge -> (escalate) -> audit.
   */
  async run(req: GenerateRequest): Promise<CoreResult> {
    const id = crypto.randomUUID();
    const started = Date.now();
    let tier: ModelTier = req.tier || 'standard';
    let escalations = 0;
    let output = '';
    let verdict: JudgeVerdict | null = null;

    // Judge tier is reserved for judging only
    if (tier === 'judge') tier = 'standard';

    for (;;) {
      const model = this.models[tier];
      const prompt = req.system
        ? `${req.system}\n\n${req.prompt}`
        : req.prompt;
      const resp = await this.gatedInfer({
        model,
        prompt,
        max_tokens: req.maxTokens ?? 1024,
      });
      output = resp.response;

      if (req.skipJudge) {
        verdict = null;
        break;
      }

      verdict = await this.judge(req.prompt, output);
      if (verdict.accepted) break;

      const idx = ESCALATION_ORDER.indexOf(tier);
      const next = ESCALATION_ORDER[idx + 1];
      if (!this.escalateOnReject || !next) break;
      logger.warn(
        `claudeclaw-core: judge rejected (${verdict.score.toFixed(2)}) on ${model}, escalating to ${this.models[next]}`
      );
      tier = next;
      escalations++;
    }

    const result: CoreResult = {
      id,
      output,
      model: this.models[tier],
      tier,
      verdict,
      escalations,
      latencyMs: Date.now() - started,
      auditPath: this.auditFile(),
    };
    this.audit({
      ts: new Date().toISOString(),
      id,
      context: req.context || null,
      tier,
      model: this.models[tier],
      prompt: req.prompt,
      system: req.system || null,
      output,
      verdict,
      escalations,
      latency_ms: result.latencyMs,
    });
    return result;
  }

  /**
   * Independent judge pass. Uses the dedicated judge model; parses a JSON
   * verdict. Unparseable judge output fails closed (score 0, flagged).
   *
   * A `claude-*` judge model routes to the Anthropic API (authenticated
   * with the local `claude login` OAuth credential) — calibration showed
   * claude-haiku-4-5 judges at 100% accuracy vs 88% for the best local
   * model, so this is the recommended judge once cloud budget is allocated.
   */
  async judge(prompt: string, output: string): Promise<JudgeVerdict> {
    const judgeModel = this.models.judge;
    const judgePrompt = `${JUDGE_SYSTEM}\n\nORIGINAL PROMPT:\n${prompt}\n\nASSISTANT OUTPUT:\n${output}\n\nJSON verdict:`;
    try {
      const raw = judgeModel.startsWith('claude-')
        ? await this.claudeOneShot(judgeModel, judgePrompt)
        : (
            await this.gatedInfer({
              model: judgeModel,
              prompt: judgePrompt,
              max_tokens: 512,
            })
          ).response;
      // deepseek-r1 emits <think>...</think> before the answer; strip it
      const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('no JSON in judge output');
      const parsed = JSON.parse(match[0]);
      const score = Math.max(0, Math.min(1, Number(parsed.score) || 0));
      return {
        score,
        accepted: score >= this.acceptThreshold,
        reasoning: String(parsed.reasoning || ''),
        judgeModel,
        hallucinationFlags: Array.isArray(parsed.hallucination_flags)
          ? parsed.hallucination_flags.map(String)
          : [],
      };
    } catch (err) {
      logger.error(`claudeclaw-core: judge failed, failing closed: ${err}`);
      return {
        score: 0,
        accepted: false,
        reasoning: `judge error: ${err}`,
        judgeModel,
        hallucinationFlags: ['judge_unparseable'],
      };
    }
  }

  /**
   * Single-turn Anthropic Messages call for cloud judges. Uses the OAuth
   * token from `claude login` (~/.claude/.credentials.json); requires the
   * oauth beta header. Note: `claude -p` cannot be spawned from inside a
   * running Claude Code session (it hangs), hence the direct API call.
   */
  private async claudeOneShot(model: string, prompt: string): Promise<string> {
    const credsPath = path.join(os.homedir(), '.claude', '.credentials.json');
    const token = JSON.parse(fs.readFileSync(credsPath, 'utf-8')).claudeAiOauth
      .accessToken as string;
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'oauth-2025-04-20',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const data: any = await resp.json();
    if (!resp.ok) {
      throw new Error(`anthropic API ${resp.status}: ${JSON.stringify(data)}`);
    }
    return (data.content || [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');
  }

  /** Read back the audit trail (most recent first). */
  readAudit(limit = 50): any[] {
    const file = this.auditFile();
    if (!fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, 'utf-8').trim().split('\n');
    return lines
      .slice(-limit)
      .reverse()
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return { corrupt: l };
        }
      });
  }

  private auditFile(): string {
    const day = new Date().toISOString().slice(0, 10);
    return path.join(this.auditDir, `audit-${day}.jsonl`);
  }

  private audit(record: object): void {
    fs.appendFileSync(this.auditFile(), JSON.stringify(record) + '\n');
  }
}

export default ClaudeClawCore;
