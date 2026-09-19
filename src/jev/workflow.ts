import * as vm from 'node:vm';
import { JevDecisionClient, JevQuestion } from './client';
import { answerConfidence, chosenLabel } from './answers';
import { stateHash } from './audit';

/**
 * Rule-based, step-by-step automation with Jev confidence gates.
 *
 * Design rules (mirroring the finance experiment's discipline):
 * - The workflow is fully declared up front: steps, tools, gates. Jev never
 *   invents steps; it only answers gate/decision questions with calibrated
 *   probabilities, and the ENGINE decides what to do with them.
 * - Every Jev call and every gate outcome lands in the audit trail (with a
 *   hash of the state that was scored) — abstentions included.
 * - Tool calls run against an explicit allow-list. Unknown tools are a hard
 *   failure, not a silent skip.
 * - `code` steps run in a fresh node:vm sandbox: no require, no process, no
 *   network, hard wall-clock timeout. The sandbox sees a JSON snapshot of the
 *   state; the step's return value is what gets saved.
 */

export interface JevGate {
  question: JevQuestion;
  /** Minimum self-reported confidence for the gate to open. */
  minConfidence: number;
  /** noul gates: required verdict. choice gates: required chosen label. */
  expect?: string;
  /** Extract only the relevant slice of state for scoring (default: all). */
  stateSelector?: (state: WorkflowContext) => unknown;
}

export interface WorkflowContext {
  [key: string]: unknown;
}

export type WorkflowStep =
  | {
      id: string;
      kind: 'tool';
      tool: string;
      args?: unknown;
      gate?: JevGate;
      when?: (state: WorkflowContext) => boolean;
      save?: string;
      optional?: boolean;
    }
  | {
      id: string;
      kind: 'code';
      code: string;
      timeoutMs?: number;
      gate?: JevGate;
      when?: (state: WorkflowContext) => boolean;
      save?: string;
      optional?: boolean;
    }
  | {
      id: string;
      kind: 'decision';
      question: JevQuestion;
      minConfidence: number;
      save: string;
      onAbstain?: 'skip' | 'abort' | 'default';
      defaultValue?: unknown;
      when?: (state: WorkflowContext) => boolean;
    };

export type StepStatus = 'executed' | 'skipped-gate' | 'skipped-condition' | 'skipped-abstain' | 'failed' | 'dry-run';

export interface StepLog {
  id: string;
  kind: string;
  status: StepStatus;
  confidence?: number;
  probability?: number;
  label?: string;
  result?: unknown;
  error?: string;
  durationMs: number;
}

export interface AuditEntry {
  at: string;
  kind: 'jev-score' | 'gate' | 'decision';
  stepId?: string;
  stateHash: string;
  question: JevQuestion;
  answer: unknown;
  confidence?: number;
  label?: string;
  outcome: string;
}

export interface WorkflowResult {
  status: 'completed' | 'failed' | 'aborted' | 'dry-run';
  state: WorkflowContext;
  steps: StepLog[];
  audit: AuditEntry[];
}

export type ToolFn = (args: unknown, state: WorkflowContext) => unknown | Promise<unknown>;

export interface WorkflowRunnerOptions {
  client?: JevDecisionClient;
  tools?: Record<string, ToolFn>;
  defaultCodeTimeoutMs?: number;
  maxSteps?: number;
  dryRun?: boolean;
}

const DEFAULT_MAX_STEPS = 100;
const DEFAULT_CODE_TIMEOUT_MS = 1_000;

export class WorkflowRunner {
  private readonly tools: Record<string, ToolFn>;

  constructor(private readonly options: WorkflowRunnerOptions) {
    this.tools = options.tools ?? {};
  }

  private needsJev(steps: readonly WorkflowStep[]): boolean {
    return !this.options.dryRun && steps.some(s => 'gate' in s && Boolean(s.gate) || s.kind === 'decision');
  }

  async run(steps: readonly WorkflowStep[], initialState: WorkflowContext = {}): Promise<WorkflowResult> {
    if (steps.length > (this.options.maxSteps ?? DEFAULT_MAX_STEPS)) {
      throw new Error(`workflow exceeds the ${this.options.maxSteps ?? DEFAULT_MAX_STEPS}-step safety limit`);
    }
    if (this.needsJev(steps) && !this.options.client) {
      throw new Error('workflow contains gates/decisions but no Jev client is configured');
    }

    const state: WorkflowContext = { ...initialState };
    const logs: StepLog[] = [];
    const audit: AuditEntry[] = [];
    let status: WorkflowResult['status'] = this.options.dryRun ? 'dry-run' : 'completed';

    for (const step of steps) {
      if (this.options.dryRun) {
        logs.push({ id: step.id, kind: step.kind, status: 'dry-run', durationMs: 0 });
        continue;
      }
      if (step.when && !step.when(state)) {
        logs.push({ id: step.id, kind: step.kind, status: 'skipped-condition', durationMs: 0 });
        continue;
      }
      try {
        if (step.kind === 'decision') {
          const outcome = await this.runDecision(step, state, logs, audit);
          if (outcome === 'abort') {
            status = 'aborted';
            break;
          }
          continue;
        }

        let gateOpen = true;
        let gateConfidence: number | undefined;
        if (step.gate) {
          const gate = await this.scoreGate(step.id, step.gate, state, audit);
          gateConfidence = gate.confidence;
          gateOpen = gate.open;
        }
        if (!gateOpen) {
          logs.push({ id: step.id, kind: step.kind, status: 'skipped-gate', confidence: gateConfidence, durationMs: 0 });
          continue;
        }

        const started = Date.now();
        if (step.kind === 'tool') {
          const tool = this.tools[step.tool];
          if (!tool) throw new Error(`tool '${step.tool}' is not in the allow-list`);
          const result = await tool(step.args, state);
          if (step.save) state[step.save] = result;
          logs.push({ id: step.id, kind: step.kind, status: 'executed', result, durationMs: Date.now() - started });
        } else {
          const result = this.runCode(step, state);
          if (step.save) state[step.save] = result;
          logs.push({ id: step.id, kind: step.kind, status: 'executed', result, durationMs: Date.now() - started });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logs.push({ id: step.id, kind: step.kind, status: 'failed', error: message, durationMs: 0 });
        if (!('optional' in step && step.optional)) {
          status = 'failed';
          break;
        }
      }
    }
    return { status, state, steps: logs, audit };
  }

  // -- Jev scoring ------------------------------------------------------------
  private async scoreGate(
    stepId: string,
    gate: JevGate,
    state: WorkflowContext,
    audit: AuditEntry[],
  ): Promise<{ open: boolean; confidence: number; label?: string }> {
    if (!this.options.client) throw new Error('gate requires a Jev client');
    const scored = gate.stateSelector ? gate.stateSelector(state) : state;
    const response = await this.options.client.evaluate({ state: scored, questions: { gate: gate.question } });
    const answer = response.answers.gate;
    if (!answer) throw new Error('Jev response is missing the gate answer');

    const confidence = answerConfidence(answer);
    const label = chosenLabel(answer);
    let open: boolean;
    if (answer.type === 'noul') {
      // Distance from the boundary is the real decision confidence for noul.
      const noulConfidence = Math.max(answer.noul, 1 - answer.noul);
      const verdict = answer.noul >= 0.5 ? 'yes' : 'no';
      open = verdict === (gate.expect ?? 'yes') && noulConfidence >= gate.minConfidence;
    } else if (answer.type === 'choice') {
      open = confidence >= gate.minConfidence && (gate.expect ? answer.choice === gate.expect : true);
    } else {
      open = confidence >= gate.minConfidence;
    }
    audit.push({
      at: new Date().toISOString(),
      kind: 'gate',
      stepId,
      stateHash: stateHash(scored),
      question: gate.question,
      answer,
      confidence,
      label: label ?? undefined,
      outcome: open ? 'open' : 'closed',
    });
    return { open, confidence, label: label ?? undefined };
  }

  private async runDecision(
    step: Extract<WorkflowStep, { kind: 'decision' }>,
    state: WorkflowContext,
    logs: StepLog[],
    audit: AuditEntry[],
  ): Promise<'continue' | 'abort'> {
    if (!this.options.client) throw new Error('decision step requires a Jev client');
    const started = Date.now();
    const response = await this.options.client.evaluate({ state, questions: { decision: step.question } });
    const answer = response.answers.decision;
    if (!answer) throw new Error('Jev response is missing the decision answer');
    const confidence = answerConfidence(answer);
    const label = chosenLabel(answer);

    audit.push({
      at: new Date().toISOString(),
      kind: 'decision',
      stepId: step.id,
      stateHash: stateHash(state),
      question: step.question,
      answer,
      confidence,
      label: label ?? undefined,
      outcome: confidence >= step.minConfidence ? 'decided' : `abstain:${step.onAbstain ?? 'skip'}`,
    });

    if (confidence < step.minConfidence) {
      const policy = step.onAbstain ?? 'skip';
      if (policy === 'abort') {
        logs.push({ id: step.id, kind: step.kind, status: 'skipped-abstain', confidence, durationMs: Date.now() - started });
        return 'abort';
      }
      if (policy === 'default') state[step.save] = step.defaultValue;
      logs.push({
        id: step.id,
        kind: step.kind,
        status: 'skipped-abstain',
        confidence,
        result: policy === 'default' ? step.defaultValue : undefined,
        durationMs: Date.now() - started,
      });
      return 'continue';
    }

    state[step.save] = {
      label,
      confidence,
      probabilities: answer.type === 'noul' ? { true: answer.noul, false: 1 - answer.noul } : answer.probabilities,
      answer,
      model: response.model,
    };
    logs.push({ id: step.id, kind: step.kind, status: 'executed', confidence, label: label ?? undefined, durationMs: Date.now() - started });
    return 'continue';
  }

  // -- sandboxed code steps ------------------------------------------------------
  private runCode(step: Extract<WorkflowStep, { kind: 'code' }>, state: WorkflowContext): unknown {
    const timeoutMs = step.timeoutMs ?? this.options.defaultCodeTimeoutMs ?? DEFAULT_CODE_TIMEOUT_MS;
    const snapshot = JSON.parse(JSON.stringify(state));
    const sandbox: Record<string, unknown> = {
      state: snapshot,
      result: undefined,
      console: { log: () => undefined },
      JSON,
      Math,
    };
    const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
    const value = new vm.Script(step.code, { filename: `workflow-${step.id}.js` })
      .runInContext(context, { timeout: timeoutMs });
    // Explicit `result = ...` wins; otherwise the script's completion value.
    const result = sandbox.result !== undefined ? sandbox.result : value;
    Object.assign(state, snapshot); // let code mutate state via the snapshot copy
    return result;
  }
}
