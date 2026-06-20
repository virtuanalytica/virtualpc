# Deliberation Gates

Internal Fusion-like deliberation gate for the ClaudeClaw agent loop.

## Skills

| Skill | Purpose |
|-------|---------|
| `architecture-control-loop` | Orchestrates source-of-truth read → deliberation → task-graph → audit → dispatch → review → final review. |
| `deliberation-preflight` | Multi-reviewer gate before task-graph for high-risk work. |
| `deliberation-task-graph-audit` | Audit task-graph before dispatching to Codex. |
| `task-graph` | Generate bounded tasks with deliberation constraints and agent routing. |
| `codex-dispatch-task` | Dispatch only approved, bounded Codex tasks. |
| `codex-review-task` | Verify Codex patches against acceptance criteria. |
| `architecture-final-review` | Final cross-cutting review. |
| `economic-analyst` | Optional calibration / cost analysis. |

## Example

See [examples/ohlcv-reader-redirection/](examples/ohlcv-reader-redirection/) for a schema-migration / reader-redirection case.

Run the smoke check against the example:

```bash
npm run smoke-deliberation-gates:example
```

Run the smoke check against the current `.ai/tasks` runtime artifacts:

```bash
npm run smoke-deliberation-gates
```

## Principles

- No OpenRouter or external multi-provider router.
- No secrets in deliberation artifacts.
- Codex remains a bounded implementation worker.
- High-risk work is reviewed before it reaches Codex.
