---
name: codex-review-task
description: "Review a Codex-generated patch against its task acceptance criteria and verification commands."
---

# Codex Review Task

## When to Use

Use after `codex-dispatch-task` completes a patch for a task.

## Inputs

- `.ai/tasks/T-###.md`
- `.ai/tasks/index.json`
- The Codex patch output

## Workflow

1. Run the verification commands listed in the task file.
2. Check that acceptance criteria are met.
3. Verify the patch only touches owned files.
4. Look for regressions in adjacent code.
5. Update `.ai/tasks/index.json` with `verified: true/false` and `review_notes`.

## Output

- If all checks pass → mark task verified and return to `architecture-control-loop`.
- If checks fail → record failure details and return to `architecture-control-loop` for retry or escalation to `claude`/`human`.

## Constraints

- Do not approve a patch that failed verification.
- Do not let Codex silently expand scope beyond owned files.
