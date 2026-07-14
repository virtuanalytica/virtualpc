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
import * as crypto from 'crypto';
import logger from '../../utils/logger';
import OllamaClient from '../local-inference/ollama-client';

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
  private models: Record<ModelTier, string>;
  private auditDir: string;
  private acceptThreshold: number;
  private escalateOnReject: boolean;

  constructor(config: ClaudeClawCoreConfig = {}) {
    this.ollama = new OllamaClient(
      config.ollamaBaseUrl,
      config.ollamaTimeoutMs ?? 360_000
    );
    this.models = { ...DEFAULT_MODELS, ...(config.models || {}) };
    this.auditDir =
      config.auditDir || path.join(process.cwd(), 'data', 'claudeclaw');
    this.acceptThreshold = config.acceptThreshold ?? 0.6;
    this.escalateOnReject = config.escalateOnReject ?? true;
    fs.mkdirSync(this.auditDir, { recursive: true });
    // Tier models are managed here, not in OllamaClient's hardcoded list
    for (const tag of Object.values(this.models)) {
      this.ollama.registerModel({ name: tag });
    }
  }

  async health(): Promise<boolean> {
    return this.ollama.checkHealth();
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
      const resp = await this.ollama.infer({
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
   */
  async judge(prompt: string, output: string): Promise<JudgeVerdict> {
    const judgeModel = this.models.judge;
    const judgePrompt = `${JUDGE_SYSTEM}\n\nORIGINAL PROMPT:\n${prompt}\n\nASSISTANT OUTPUT:\n${output}\n\nJSON verdict:`;
    try {
      const resp = await this.ollama.infer({
        model: judgeModel,
        prompt: judgePrompt,
        max_tokens: 512,
      });
      // deepseek-r1 emits <think>...</think> before the answer; strip it
      const cleaned = resp.response.replace(/<think>[\s\S]*?<\/think>/g, '');
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
