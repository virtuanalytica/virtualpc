/**
 * Jev engine — generalized confidence-gated decisions for VirtualPC.
 *
 * Finance uses Jev as a point-in-time feature generator (src/finance). This
 * module makes the same typed-question protocol available platform-wide:
 *
 *   POST /api/jev/status           → configuration status (no secrets)
 *   POST /api/jev/classify         → one classification over declared labels
 *   POST /api/jev/decide           → one heuristic yes/no with abstention
 *   POST /api/jev/workflow/run     → rule-based step executor with Jev gates
 *   POST /api/jev/tasks/route      → Kafka-style task routing decision
 *
 * Safety posture (docs/JEV-ENGINE.md): Jev is a probability source, never an
 * unconditional oracle. Workflows are declared up front; the engine — not the
 * model — decides, tools are allow-listed, and code steps run in a hardened
 * node:vm sandbox with a wall-clock timeout.
 */
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { JevQuestion } from './client';
import { createJevClient, jevConfigFromEnv } from './config';
import { classify } from './classify';
import { decide } from './heuristics';
import { WorkflowRunner, WorkflowStep } from './workflow';
import { TaskRouter } from './router';

export { HttpJevClient, JevDecisionClient } from './client';
export * from './answers';
export * from './config';
export * from './classify';
export * from './heuristics';
export * from './workflow';
export * from './router';

const questionSchema: z.ZodType<JevQuestion> = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('noul'),
    instructions: z.string().min(1),
    criteria: z.object({ true: z.string(), false: z.string() }).optional(),
  }),
  z.object({
    type: z.literal('choice'),
    instructions: z.string().min(1),
    criteria: z.record(z.string(), z.string().nullable()),
  }),
  z.object({
    type: z.literal('score'),
    instructions: z.string().min(1),
    criteria: z.array(z.string()),
  }),
]);

const classifySchema = z.object({
  state: z.unknown(),
  instructions: z.string().min(1),
  classes: z.record(z.string(), z.string()),
  minConfidence: z.number().min(0).max(1).optional(),
});

const decideSchema = z.object({
  state: z.unknown(),
  instructions: z.string().min(1),
  criteria: z.object({ true: z.string(), false: z.string() }).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
});

const gateSchema = z.object({
  question: questionSchema,
  minConfidence: z.number().min(0).max(1),
  expect: z.string().optional(),
});

const stepSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('tool'),
    id: z.string().min(1),
    tool: z.string().min(1),
    args: z.unknown().optional(),
    gate: gateSchema.optional(),
    save: z.string().optional(),
    optional: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('code'),
    id: z.string().min(1),
    code: z.string().min(1),
    timeoutMs: z.number().int().positive().max(5_000).optional(),
    gate: gateSchema.optional(),
    save: z.string().optional(),
    optional: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('decision'),
    id: z.string().min(1),
    question: questionSchema,
    minConfidence: z.number().min(0).max(1),
    save: z.string().min(1),
    onAbstain: z.enum(['skip', 'abort', 'default']).optional(),
    defaultValue: z.unknown().optional(),
  }),
]);

const workflowSchema = z.object({
  state: z.record(z.string(), z.unknown()).optional(),
  steps: z.array(stepSchema).min(1).max(100),
  dryRun: z.boolean().optional(),
});

const routeSchema = z.object({
  task: z.object({
    id: z.string().optional(),
    payload: z.unknown(),
    hint: z.string().optional(),
  }),
});

export function registerJevRoutes(app: Express): void {
  app.get('/api/jev/status', (_req: Request, res: Response) => {
    const config = jevConfigFromEnv();
    res.json({
      success: true,
      engine: 'jev-engine',
      version: 1,
      configured: Boolean(config.apiKey),
      model: config.model,
      features: ['classify', 'decide', 'workflow'],
    });
  });

  app.post('/api/jev/classify', async (req: Request, res: Response) => {
    const parsed = classifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message });
      return;
    }
    const client = createJevClient();
    if (!client) {
      res.status(503).json({ success: false, error: 'TYPESAFE_API_KEY is not configured' });
      return;
    }
    try {
      const result = await classify(client, parsed.data);
      res.json({ success: true, result });
    } catch (error) {
      res.status(502).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/jev/decide', async (req: Request, res: Response) => {
    const parsed = decideSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message });
      return;
    }
    const client = createJevClient();
    if (!client) {
      res.status(503).json({ success: false, error: 'TYPESAFE_API_KEY is not configured' });
      return;
    }
    try {
      const result = await decide(client, parsed.data);
      res.json({ success: true, result });
    } catch (error) {
      res.status(502).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * Kafka-style task routing. The HTTP surface classifies and returns the
   * routing DECISION (lane, confidence, audit) — it does not dispatch to
   * inference backends; hosts register TaskHandlers in-process via TaskRouter.
   */
  app.post('/api/jev/tasks/route', async (req: Request, res: Response) => {
    const parsed = routeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message });
      return;
    }
    const client = createJevClient();
    if (!client) {
      res.status(503).json({ success: false, error: 'TYPESAFE_API_KEY is not configured' });
      return;
    }
    try {
      const router = new TaskRouter({ client, handlers: [] });
      // handlers=[] → confident lanes report their lane; actual dispatch always
      // escalates to the mixture shape with `votes: []` for remote callers.
      const decision = await router.route(parsed.data.task);
      res.json({
        success: true,
        result: {
          taskId: decision.taskId,
          category: decision.category,
          confidence: decision.scoring.confidence,
          probabilities: decision.scoring.probabilities,
          abstained: decision.scoring.abstained,
          dispatchedTo: decision.dispatchedTo,
          mixture: decision.mixture,
          audit: decision.audit,
        },
      });
    } catch (error) {
      res.status(502).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * Run a declared workflow. The HTTP surface intentionally exposes NO
   * external tools: allow-listed tools are registered in-process by the host
   * (see WorkflowRunnerOptions.tools); remote callers get the sandboxed `code`
   * kind plus gates/decisions only.
   */
  app.post('/api/jev/workflow/run', async (req: Request, res: Response) => {
    const parsed = workflowSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message });
      return;
    }
    const needsJev = parsed.data.steps.some(s => ('gate' in s && s.gate) || s.kind === 'decision');
    const client = createJevClient();
    if (needsJev && !client && !parsed.data.dryRun) {
      res.status(503).json({ success: false, error: 'TYPESAFE_API_KEY is not configured' });
      return;
    }
    try {
      const runner = new WorkflowRunner({
        client: client ?? undefined,
        tools: {},
        maxSteps: parsed.data.steps.length,
        dryRun: parsed.data.dryRun,
      });
      const result = await runner.run(parsed.data.steps as WorkflowStep[], parsed.data.state ?? {});
      res.json({ success: true, result });
    } catch (error) {
      res.status(502).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
}
