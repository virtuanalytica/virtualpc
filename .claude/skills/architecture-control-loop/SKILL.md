---
name: architecture-control-loop
description: "Own planning and orchestration for non-trivial work. Read source-of-truth, optionally run economic analysis, run deliberation gates for high-risk work, build a task-graph, audit it, dispatch tasks, review them, and run a final architecture review."
---

# Architecture Control Loop

## When to Use

Use this skill for any non-trivial request where the operator wants code or design changes that touch architecture, migrations, ML, risk, security, or data pipelines.

## Workflow

```
1. Source-of-truth read
2. Optional economic-analyst (when calibration-shaped)
3. Deliberation-preflight          ← NEW GATE (high-risk only)
4. Task-graph
5. Deliberation-task-graph-audit   ← NEW GATE
6. Codex-dispatch-task
7. Codex-review-task
8. Architecture-final-review
```

## 1. Source-of-Truth Read

Read the relevant docs, ADRs, schemas, and source files. Summarize the current state and the operator goal.

## 2. Optional Economic Analyst

If the request is calibration-shaped (cost, latency, throughput, token budget, compute budget), run `economic-analyst` to quantify tradeoffs before designing the change.

## 3. Deliberation Preflight Gate

### When to Run

Run `deliberation-preflight` when the request matches any of these categories:

- Architecture critique or large architectural change
- Migration plan review
- External repo evaluation
- Security tradeoff review
- Model/tool selection decision
- ML leakage / PIT / train-serve skew review
- Feature / regime / risk overlay critique
- Data pipeline or schema migration review
- Reader redirection risk

### When to Skip

Do **not** run for routine small refactors, formatting, simple SQL generation, test-only changes, or trivial isolated bugfixes.

### How to Run

1. Call `/skill deliberation-preflight` (or follow its SKILL.md).
2. Pass it the operator goal, proposed plan, and source-of-truth summary.
3. Collect the artifacts:
   - `.ai/deliberation/preflight/YYYY-MM-DD-<slug>.json`
   - `.ai/deliberation/preflight/YYYY-MM-DD-<slug>.md`

### Stop Conditions

- If `verdict` is `revise_plan_before_task_graph` → stop, report findings to operator, and ask for a revised plan.
- If `verdict` is `needs_research` → stop and list open research items.
- If `verdict` is `human_review_required` → stop and route to human.
- If `verdict` is `approve_for_task_graph` → continue, passing the artifact path to `task-graph`.

## 4. Task Graph

Call `/skill task-graph`. Provide:

- Operator goal
- Source-of-truth summary
- Preflight artifact path (if deliberation ran)
- Preflight constraints, risk flags, and routing guidance

`task-graph` must produce:

- `.ai/tasks/index.json`
- `.ai/tasks/T-###.md`

## 5. Deliberation Task-Graph Audit Gate

1. Call `/skill deliberation-task-graph-audit`.
2. Provide the task-graph artifacts and the preflight artifact.
3. Collect:
   - `.ai/deliberation/task-graph-audit/YYYY-MM-DD-<slug>.json`
   - `.ai/deliberation/task-graph-audit/YYYY-MM-DD-<slug>.md`

### Stop Conditions

- If `verdict` is `revise_tasks` → stop, report required edits, and ask the operator whether to revise the task-graph.
- If `verdict` is `human_review_required` → stop and route to human.
- If `verdict` is `dispatch_ok` → continue.

## 6. Codex Dispatch Task

Call `/skill codex-dispatch-task` for each task marked `implementation_agent: codex` and `gate_status: deliberation_approved`.

## 7. Codex Review Task

Call `/skill codex-review-task` for each completed Codex patch. Verify acceptance criteria and run verification commands.

## 8. Architecture Final Review

Call `/skill architecture-final-review` to validate cross-cutting consistency, update ADRs/docs, and approve merge.

## Safety Rules

- Do **not** dispatch Codex if deliberation-preflight did not approve the plan.
- Do **not** dispatch Codex if task-graph audit did not return `dispatch_ok`.
- Do **not** pass secrets into any deliberation artifact.
- Do **not** use OpenRouter or any external multi-provider router.
