---
name: task-graph
description: "Turn an approved plan into bounded implementation tasks. Consume deliberation constraints, assign the right implementation agent, and produce .ai/tasks/index.json plus .ai/tasks/T-###.md files."
---

# Task Graph

## When to Use

Use after a plan is approved (by operator or by `deliberation-preflight`) and before `deliberation-task-graph-audit`.

## Inputs

- Operator goal
- Source-of-truth summary
- Approved plan
- `.ai/deliberation/preflight/YYYY-MM-DD-<slug>.md` and `.json` (if deliberation ran)

## Outputs

```
.ai/tasks/
  index.json
  T-001.md
  T-002.md
  ...
```

## Task File Template

Each `.ai/tasks/T-###.md` must contain:

```markdown
# T-### — <title>

## Objective
One-sentence goal.

## Context
Relevant constraints from deliberation. Do not paste the full deliberation output; include only constraints that affect this task.

## Owned Files
- `path/to/file.ts`

## Out-of-Scope
- `path/to/other.ts`

## Required Behavior
...

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Verification Commands
```bash
npm test -- path/to/test.ts
```

## Implementation Agent
codex | claude | human

## Risk Flags
- schema_migration
- ml_leakage
- reader_redirection
```

## index.json Schema

```json
{
  "version": "1",
  "slug": "...",
  "deliberation_refs": [".ai/deliberation/preflight/YYYY-MM-DD-<slug>.md"],
  "tasks": [
    {
      "id": "T-001",
      "title": "...",
      "file": ".ai/tasks/T-001.md",
      "implementation_agent": "codex" | "claude" | "human",
      "parallel_group": null | "A",
      "depends_on": ["T-002"],
      "owned_files": ["..."],
      "risk_flags": [],
      "gate_status": "deliberation_approved"
    }
  ]
}
```

## Rules

1. **Consume deliberation constraints.**
   - Copy relevant constraints into each task's **Context** section.
   - Add `deliberation_refs` to `index.json`.
   - Copy `risk_flags` from deliberation to each affected task.
   - Set `gate_status: deliberation_approved` for every task when a preflight artifact exists.

2. **Keep tasks bounded.**
   - One objective per task.
   - Owned files should be a small, explicit list.
   - Out-of-scope must protect adjacent code.

3. **Assign the right agent.**
   - `codex`: bounded, small, clear owned files, deterministic verification.
   - `claude`: exploratory, cross-file reasoning, ambiguous interfaces, failed Codex twice.
   - `human`: secrets, irreversible migration, live trading risk, legal/security decision.

4. **Parallel groups.**
   - Only group tasks with disjoint owned files or a stable written interface contract.
   - Do not put schema migrations, public API changes, auth boundary changes, or reader redirection steps in the same parallel group.

5. **No bloat.**
   - Do not paste the full deliberation markdown into every task file.
   - Include only constraints relevant to that task.

6. **No secrets.**
   - Do not include API keys, passwords, tokens, or `.env` content.
