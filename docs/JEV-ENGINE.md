# Jev engine — confidence-gated decisions for VirtualPC

Jev (TypeSafe System One, `jev-latest`) answers typed questions with
calibrated probabilities. Finance already uses it as a point-in-time feature
generator (`docs/JEV-FINANCE-EXPERIMENT.md`). This module generalises that
same protocol to the whole platform:

| Concern | Module | What Jev does / does not do |
|---|---|---|
| Heuristic yes/no decisions | `src/jev/heuristics.ts` | Scores a `noul` question; the ENGINE converts the probability into a verdict and refuses to decide inside the uncertainty band (abstention is a first-class outcome). |
| Classification | `src/jev/classify.ts` | Scores one `choice` question over declared labels; the engine renormalises over exactly those labels and abstains below the confidence floor instead of guessing. |
| Step-by-step automation | `src/jev/workflow.ts` | Workflows are **declared up front**. Jev only answers gates/decision questions with probabilities; the engine — not the model — decides, executes allow-listed tools, and runs code. |

## Confidence semantics

- `choice`/`score` answers carry a separate `confidence`; gates use it directly.
- `noul` answers do not: decision confidence is the distance from the 0.5
  boundary, `max(p, 1-p)`. A confident NO at p=0.1 is as decisive as a
  confident YES at p=0.9. Below the floor the engine abstains.
- Abstention policies per decision step: `skip` (continue without the value),
  `default` (write a declared default), `abort` (stop the workflow).

## Rule-based workflow executor

```ts
const runner = new WorkflowRunner({
  client,                                // only needed if steps use gates
  tools: { 'astra.fetch-quote': fetchQuote },   // explicit allow-list
});
const result = await runner.run([
  { id: 'classify', kind: 'decision', question: { type: 'choice', instructions: 'Which kind of request is this?',
      criteria: { quote: 'price request', support: 'defect report' } },
    minConfidence: 0.8, save: 'intent', onAbstain: 'default', defaultValue: 'support' },
  { id: 'lookup', kind: 'tool', tool: 'astra.fetch-quote',
    gate: { question: { type: 'noul', instructions: 'Is the customer profile complete for pricing?' },
            minConfidence: 0.8, stateSelector: s => s.customer },
    when: state => state.intent.label === 'quote', save: 'quote' },
  { id: 'summarise', kind: 'code', save: 'summary',
    code: 'result = `intent=${state.intent.label} total=${state.quote ? state.quote.total : "n/a"}`' },
], initialState);
// result.status | result.state | result.steps | result.audit
```

Step kinds:

- `tool` — calls a registered allow-listed function; unknown tools fail the
  step (workflow fails unless `optional: true`). HTTP callers get **no**
  external tools: the route exposes only declared-in-process registries.
- `code` — sandboxed `node:vm` script: no `require`, no `process`, no network,
  disabled code-generation, hard wall-clock timeout (default 1 s, max 5 s over
  HTTP). Sees a JSON snapshot of `state`; `result = ...` (or the completion
  value) is saved.
- `decision` — stores the Jev answer (label, probabilities, confidence) into
  the state and applies the abstention policy.

Every step additionally supports:

- `when: (state) => boolean` — plain rule-based condition, evaluated without
  touching Jev;
- `gate` (tool/code steps) — a typed question scored against the live state
  (optionally narrowed via `stateSelector`); a closed gate skips the step and
  is written to the audit trail.

## Audit trail

Every Jev call records: timestamp, step id, SHA-256 hash of the exact state
that was scored, the question, the raw answer, confidence/label, and the
outcome (`open`/`closed`, `decided`, `abstain:<policy>`). Abstentions are
logged, never swallowed — the same discipline as the finance experiment.

## HTTP surface

- `GET  /api/jev/status` — configured flag + model alias, no secrets;
- `POST /api/jev/classify` — `{ state, instructions, classes, minConfidence? }`;
- `POST /api/jev/decide` — `{ state, instructions, criteria?, minConfidence? }`;
- `POST /api/jev/workflow/run` — `{ state?, steps[], dryRun? }` (steps are
  zod-validated; `code.timeoutMs` capped at 5 s; no external tools).

`dryRun: true` plans the workflow without calling Jev or any tool — every step
logs `dry-run`.

## Configuration

Shared with finance: `TYPESAFE_API_KEY` (required for live scoring),
`TYPESAFE_MODEL` (default `jev-latest`), `TYPESAFE_API_URL`. Without an API
key, rule-only workflows (conditions/tools/code without gates) still run, and
gate/decision workflows return HTTP 503 instead of pretending to decide.

## Sources

- TypeSafe, "Introducing System One Models and Jev" (2026-09-14):
  <https://typesafe.ai/blog/introducing-system-one-models-and-jev>
- TypeSafe API reference: <https://docs.typesafe.ai/api>
- Finance experiment discipline: `docs/JEV-FINANCE-EXPERIMENT.md`
