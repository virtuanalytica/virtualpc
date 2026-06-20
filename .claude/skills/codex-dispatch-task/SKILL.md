---
name: codex-dispatch-task
description: "Dispatch a single bounded task to Codex only after deliberation gates approve it. Refuse high-risk tasks missing gate_status or routed to claude/human."
---

# Codex Dispatch Task

## When to Use

Use when `architecture-control-loop` asks you to dispatch an implementation task to Codex.

## Preconditions

Before running Codex, verify:

1. `.ai/tasks/index.json` exists.
2. The task is listed in `index.json`.
3. The task file `.ai/tasks/T-###.md` exists.

## Pre-Flight Checks

### 1. Gate Status

If the task's `risk_flags` include any of:

- `schema_migration`
- `ml_leakage`
- `security`
- `external_repo`
- `reader_redirection`

Then `gate_status` must equal `deliberation_approved`. If missing, **STOP** and hand back to `architecture-control-loop`.

### 2. Implementation Agent

Read `implementation_agent` from the task file and `index.json`.

- If `claude` → **do not run Codex.** Hand back to `architecture-control-loop` for Claude dispatch.
- If `human` → **do not run Codex.** Hand back for human review.
- If `codex` → proceed.

### 3. Task Boundaries

Reject and hand back if the task:

- Has no owned files.
- Has no acceptance criteria.
- Has no verification commands.
- Touches files outside its owned list.
- Is marked as a schema/ML/security/reader-redirection task but has no deliberation ref.

## Running Codex

Use the existing Codex CLI wrapper. Typical invocation:

```bash
codex exec -C . --skip-git-repo-check \
  --dangerously-bypass-approvals-and-sandbox \
  --color never \
  "Implement T-### per .ai/tasks/T-###.md. Owned files: ..."
```

Capture the patch output. Do not modify the patch-output workflow.

## Post-Dispatch

1. Record the dispatch in `.ai/tasks/index.json` under `dispatched_at` and `codex_session_id` if available.
2. Hand off to `codex-review-task` for verification.

## Constraints

- Do **not** weaken the existing Codex wrapper.
- Codex remains a bounded implementation worker.
- No OpenRouter or external routing API.
- No secrets in task files or command arguments.
