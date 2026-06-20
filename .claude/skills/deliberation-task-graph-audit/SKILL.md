---
name: deliberation-task-graph-audit
description: "Audit a generated task-graph before dispatching tasks to Codex. Verify task bounds, owned files, parallel-group safety, verification commands, and correct implementation-agent routing."
---

# Deliberation Task-Graph Audit

## When to Use

Run immediately after `task-graph` has produced:

- `.ai/tasks/T-###.md` files
- `.ai/tasks/index.json`

Run **before** `codex-dispatch-task`.

## Goal

Catch unsafe task decomposition, missing owned files, weak verification, and wrong agent routing before any implementation work starts.

## Output Artifacts

```
.ai/deliberation/task-graph-audit/
  YYYY-MM-DD-<slug>.json
  YYYY-MM-DD-<slug>.md
```

`<slug>` must match the slug used by the corresponding preflight artifact.

## Inputs

1. `.ai/tasks/index.json`
2. Every `.ai/tasks/T-###.md`
3. `.ai/deliberation/preflight/YYYY-MM-DD-<slug>.md` and `.json` (if available)

## Audit Checks

For every task, verify:

1. **Bounded objective** — the task does one thing, not an entire epic.
2. **Context** — includes relevant deliberation constraints, risk flags, and preflight refs.
3. **Owned files** — explicit list of files the task may edit.
4. **Out-of-scope** — explicit list of related files the task must not touch.
5. **Required behavior** — what the task must do in plain language.
6. **Acceptance criteria** — verifiable, yes/no conditions.
7. **Verification commands** — specific tests, type checks, or commands to run.
8. **Tests in owned files** — if verification mentions `vitest/test/spec/jest`, the test files must be listed in `owned_files`.

For parallel groups (`parallel_group` in `index.json`), verify:

1. **Disjoint owned files** — or a stable written interface contract between tasks.
2. **No shared mutable surfaces** — no two parallel tasks modify the same schema, generated type, public API, auth boundary, build surface, or migration sequence.
3. **Ordering is explicit** — if order matters, tasks are in sequential groups or have `depends_on`.

For data/ML tasks, verify:

- PIT/leakage/data-quality verification is present.
- Feature availability and label horizon are documented.

For migration tasks, verify:

- Compatibility view / backfill / reader sequencing is included when needed.
- Reader redirection tasks depend on canonical table/view validation.

For implementation-agent routing, verify:

- `codex`: bounded, small, clear owned files, deterministic verification.
- `claude`: exploratory, cross-file reasoning, ambiguous interfaces, failed Codex twice.
- `human`: secrets, irreversible migration, live trading risk, legal/security decision.

## Output Schema

```json
{
  "gate": "deliberation-task-graph-audit",
  "slug": "...",
  "verdict": "dispatch_ok" | "revise_tasks" | "human_review_required",
  "blocked_tasks": ["T-001", "..."],
  "unsafe_parallel_groups": ["..."],
  "missing_owned_files": ["T-001", "..."],
  "missing_tests": ["T-002", "..."],
  "weak_verification": ["T-003", "..."],
  "bad_agent_routes": ["T-004", "..."],
  "required_task_edits": [
    {
      "task": "T-001",
      "reason": "...",
      "required_changes": ["..."]
    }
  ],
  "required_index_json_edits": ["..."],
  "dispatch_order": ["T-001", "T-002", "..."],
  "codex_safe_tasks": ["T-001", "..."],
  "claude_preferred_tasks": ["T-005", "..."],
  "human_required_tasks": ["T-006", "..."]
}
```

## Routing Rules

- Any `blocked_tasks` or `unsafe_parallel_groups` ⇒ `revise_tasks`.
- Any `human_required_tasks` ⇒ `human_review_required` unless those tasks are removed from the current dispatch set.
- Otherwise, produce `dispatch_ok` and a `dispatch_order`.

## Human-Readable Summary

The `.md` file must include:

- Verdict
- Blocked tasks and why
- Unsafe parallel groups
- Missing tests or weak verification
- Required edits
- Dispatch order
- Which tasks are safe for Codex, Claude, or human

## Constraints

- Do not modify task files directly. Only produce audit artifacts and required-edit recommendations.
- Do not pass secrets into the audit.
- No OpenRouter or external routing API.
