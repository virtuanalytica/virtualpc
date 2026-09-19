import { JevDecisionClient } from './client';
import { classify, Classification } from './classify';
import { stateHash } from './audit';

/**
 * Kafka-style task intake with Jev as the router.
 *
 *   incoming task ──> Jev classify ──> coding        -> coder handler (Qwen/Coder)
 *                                  └─> reasoning     -> large reasoning model
 *                                  └─> classification-> local cheap model
 *                                  └─> uncertain     -> mixture-of-models
 *
 * The same discipline as everywhere else in this engine applies: Jev only
 * scores the task; the ROUTER decides. A confident label dispatches to the
 * one handler serving that lane; low confidence or an explicit `uncertain`
 * escalates to the mixture (all registered handlers fan out, results are
 * aggregated). Handlers are dependency-injected — this module never imports
 * a specific inference backend, so lmstudio/OpenAI/claude wiring stays in
 * the host (see buildDefaultHandlers in the deployment wiring).
 */

export type TaskCategory = 'coding' | 'reasoning' | 'classification' | 'uncertain';

export const TASK_CATEGORIES: TaskCategory[] = ['coding', 'reasoning', 'classification', 'uncertain'];

export interface IncomingTask {
  id?: string;
  payload: unknown;
  /** Optional free-text hint folded into the scoring state. */
  hint?: string;
}

export interface TaskHandler {
  name: string;
  categories: readonly TaskCategory[];
  handle(task: IncomingTask, category: TaskCategory, scoring: Classification<TaskCategory>): Promise<unknown> | unknown;
}

export type MixtureAggregator = (
  results: Array<{ handler: string; category: TaskCategory | null; confidence: number; output: unknown }>,
) => unknown;

export interface RouterOptions {
  client: JevDecisionClient;
  handlers: readonly TaskHandler[];
  /** Confidence below this routes to the uncertain lane (default 0.6). */
  minConfidence?: number;
  aggregateMixture?: MixtureAggregator;
}

export interface RoutingDecision {
  taskId: string;
  category: TaskCategory;
  dispatchedTo: string | null;
  mixture: boolean;
  scoring: Classification<TaskCategory>;
  output?: unknown;
  audit: Array<Record<string, unknown>>;
}

export class TaskRouter {
  private readonly queue: Array<{
    task: IncomingTask;
    resolve: (decision: RoutingDecision) => void;
    reject: (error: Error) => void;
  }> = [];
  private draining = false;

  constructor(private readonly options: RouterOptions) {
    if (!options.client) throw new Error('TaskRouter needs a Jev client to score tasks');
    if (!options.handlers.length) throw new Error('TaskRouter needs at least one handler');
  }

  /** Score + dispatch one task immediately (no queue). */
  async route(task: IncomingTask): Promise<RoutingDecision> {
    const minConfidence = this.options.minConfidence ?? 0.6;
    const audit: Array<Record<string, unknown>> = [];
    const taskId = task.id ?? `task-${stateHash(task.payload).slice(0, 8)}-${Date.now() % 100_000}`;
    const scoring = await classify(this.options.client, {
      state: { payload: task.payload, hint: task.hint ?? null },
      instructions:
        'Route this incoming task to the lane that should execute it. ' +
        'coding = write/fix/review code. reasoning = multi-step thinking, math, trade-offs. ' +
        'classification = labelling or sorting records. uncertain = ambiguous, mixed, or none of these.',
      classes: {
        coding: 'implements, fixes, reviews, or tests code (best lane: code model such as Qwen/Coder)',
        reasoning: 'needs multi-step reasoning, planning, math, or trade-off analysis (best lane: large reasoning model)',
        classification: 'labelling, sorting, or tagging records (best lane: cheap local model)',
        uncertain: 'ambiguous or mixed task — escalate to a mixture of models',
      },
      minConfidence: 0, // the router applies its own lane threshold below
    });

    const label = scoring.label as TaskCategory | null;
    const confident = !scoring.abstained && label !== 'uncertain' && scoring.confidence >= minConfidence;
    let category: TaskCategory = confident && label ? label : 'uncertain';
    let dispatchedTo: string | null = null;
    let mixture = false;
    let output: unknown;

    const serving = confident && label ? this.options.handlers.filter(h => h.categories.includes(category)) : [];
    if (confident && serving.length) {
      const handler = serving[0];
      dispatchedTo = handler.name;
      output = await handler.handle(task, category, scoring);
      audit.push(routingAudit(taskId, scoring, category, handler.name, 'routed'));
    } else {
      mixture = true;
      category = 'uncertain';
      const fanout = await Promise.all(this.options.handlers.map(async handler => ({
        handler: handler.name,
        category: handler.categories[0] ?? null,
        confidence: scoring.confidence,
        output: await handler.handle(task, 'uncertain', scoring),
      })));
      output = this.options.aggregateMixture
        ? this.options.aggregateMixture(fanout)
        : { strategy: 'mixture', votes: fanout };
      audit.push(routingAudit(taskId, scoring, 'uncertain', fanout.map(f => f.handler), 'mixture'));
    }
    return { taskId, category, dispatchedTo, mixture, scoring, output, audit };
  }

  /**
   * Kafka-style intake: enqueue and resolve in FIFO order (single consumer,
   * ordered, back-pressured by await). Returns a promise per submitted task.
   */
  submit(task: IncomingTask): Promise<RoutingDecision> {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      void this.drain();
    });
  }

  get queueDepth(): number {
    return this.queue.length;
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length) {
        const job = this.queue.shift()!;
        try {
          job.resolve(await this.route(job.task));
        } catch (error) {
          job.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    } finally {
      this.draining = false;
    }
  }
}

function routingAudit(taskId: string, scoring: Classification<TaskCategory>, category: TaskCategory,
                      target: string | string[], outcome: string): Record<string, unknown> {
  return {
    at: new Date().toISOString(),
    kind: 'route',
    taskId,
    stateHash: stateHash(scoring.answer),
    question: 'task-category',
    answer: scoring.answer,
    confidence: scoring.confidence,
    label: scoring.label,
    category,
    target,
    outcome,
  };
}
