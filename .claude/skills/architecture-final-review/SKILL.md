---
name: architecture-final-review
description: "Final cross-cutting review after all tasks are implemented and verified. Update ADRs/docs and approve merge."
---

# Architecture Final Review

## When to Use

Use after `codex-review-task` has verified all dispatched tasks.

## Inputs

- All `.ai/tasks/T-###.md`
- `.ai/tasks/index.json`
- Preflight and task-graph-audit artifacts
- Current source tree

## Workflow

1. Review the combined diff for cross-cutting consistency.
2. Check that deliberation constraints were honored.
3. Verify ADRs and docs are updated if architecture changed.
4. Confirm no secrets or credentials were introduced.
5. Confirm test/verification commands pass for the whole change.

## Output

- Approve merge, or
- Return a list of final fixes to `architecture-control-loop`.

## Constraints

- Do not approve if any high-risk task bypassed deliberation.
- No secrets in final artifacts.
