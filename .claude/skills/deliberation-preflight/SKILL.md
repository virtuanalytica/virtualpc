---
name: deliberation-preflight
description: "Run a multi-reviewer deliberation gate before building a task-graph for high-risk work: architecture critique, migration plan review, external repo evaluation, security tradeoff, model/tool selection, ML leakage review, feature/regime/risk critique, data pipeline/schema migration review, or reader redirection risk."
---

# Deliberation Preflight

## When to Use

Run this gate when the operator request matches any of these categories:

1. Architecture critique or large architectural change
2. Migration plan review (schema, dependency, runtime, platform)
3. External repo evaluation or third-party integration
4. Security tradeoff review
5. Model/tool selection decision
6. ML leakage / point-in-time / train-serve skew review
7. Feature / regime / risk overlay critique
8. Data pipeline or schema migration review
9. Reader redirection risk (L1/L2/L3 reader migration, canonical table rollout)

## When NOT to Use

Do **not** run for:

- Routine small refactors
- Formatting or lint fixes
- Simple SQL generation
- Test-only changes
- Trivial isolated bugfixes

## Goal

Produce an independent, multi-reviewer analysis that exposes blockers, major risks, contradictions, blind spots, and dispatch constraints **before** a task-graph is built.

## Output Artifacts

```
.ai/deliberation/
  reviewer-memos/
    YYYY-MM-DD-<slug>-architecture-breaker.json
    YYYY-MM-DD-<slug>-migration-data-pipeline.json
    YYYY-MM-DD-<slug>-ml-leakage-pit.json
    YYYY-MM-DD-<slug>-trading-risk-regime.json
    YYYY-MM-DD-<slug>-security-supply-chain.json
    YYYY-MM-DD-<slug>-tooling-model-selection.json
  preflight/
    YYYY-MM-DD-<slug>.json
    YYYY-MM-DD-<slug>.md
```

`<slug>` is a short kebab-case identifier derived from the operator goal (e.g. `ohlcv-reader-redirection`, `auth-boundary-refactor`).

## Inputs to Collect

Build a review packet named `.ai/deliberation/reviewer-memos/YYYY-MM-DD-<slug>-packet.md` containing:

- User goal and success criteria
- Proposed architecture plan or migration plan
- Relevant docs / ADR summaries
- Relevant source file summaries
- Affected schemas / tables / pipelines
- Known constraints (performance, compliance, downtime, budget)
- Proposed external repos/tools, if any
- Explicit rule: **no secrets, no env files, no credentials** in any artifact

## Workflow

1. **Build the packet.** Read source files, docs, ADRs, schemas, and the operator request. Summarize only what is relevant. Do not copy secrets.
2. **Run six independent reviewer passes.**
   - If Claude Code subagents/tasks are available, spawn each reviewer as a separate task with only the packet as input.
   - Otherwise, simulate independence by completing one reviewer memo at a time **without reading the other reviewer memos** until all six are written.
   - Each reviewer sees the same packet and the same JSON schema. They do not see each other's outputs.
3. **Write each reviewer memo** to `.ai/deliberation/reviewer-memos/YYYY-MM-DD-<slug>-<reviewer>.json` using the Reviewer Output Schema below.
4. **Judge / synthesis pass.** Read **only** the six reviewer JSON files. Produce:
   - `.ai/deliberation/preflight/YYYY-MM-DD-<slug>.json` (Judge Output Schema)
   - `.ai/deliberation/preflight/YYYY-MM-DD-<slug>.md` (human-readable summary)
5. **Apply routing rules** and return the verdict to the caller.

## Reviewer Output Schema

```json
{
  "reviewer": "architecture-breaker",
  "verdict": "approve" | "revise" | "block" | "needs_research",
  "risk_items": [
    {
      "id": "RISK-001",
      "severity": "blocker" | "major" | "minor",
      "category": "architecture" | "migration" | "security" | "ml_leakage" | "risk_regime" | "tooling" | "reader_redirection" | "external_repo",
      "finding": "...",
      "evidence": "...",
      "why_it_matters": "...",
      "recommended_constraint": "...",
      "required_verification": "...",
      "route_impact": "codex_ok" | "claude_preferred" | "human_required"
    }
  ],
  "blind_spots": ["..."],
  "questions": ["..."],
  "recommended_task_graph_constraints": ["..."],
  "recommended_verification_gates": ["..."]
}
```

### Required Reviewers

#### 1. Architecture Breaker
Focus: wrong layer, broken boundaries, wrong ownership, hidden coupling, missing ADR/doc update.

#### 2. Migration / Data Pipeline Reviewer
Focus: schema ordering, backwards compatibility, canonical table strategy, reader redirection, pipeline breaks.

#### 3. ML Leakage / PIT Reviewer
Focus: point-in-time correctness, target leakage, feature availability, label leakage, train/serve skew.

#### 4. Trading / Risk / Regime Reviewer
Focus: feature/regime/risk overlay coupling, strategy decision safety, live-trading failure modes.

#### 5. Security / Supply Chain Reviewer
Focus: external repos, data egress, secrets, auth boundaries, dependency risk, unsafe tool use.

#### 6. Tooling / Model Selection Reviewer
Focus: whether Codex is the right implementation agent, whether Claude/human is better, verification depth.

## Judge Output Schema

```json
{
  "gate": "deliberation-preflight",
  "slug": "...",
  "verdict": "approve_for_task_graph" | "revise_plan_before_task_graph" | "needs_research" | "human_review_required",
  "summary": "...",
  "consensus_findings": ["..."],
  "contradictions_between_reviewers": ["..."],
  "blind_spots": ["..."],
  "blockers": ["..."],
  "major_risks": ["..."],
  "task_graph_constraints": ["..."],
  "required_integration_tasks": ["..."],
  "required_verification_gates": ["..."],
  "route_to_claude": ["..."],
  "route_to_human": ["..."],
  "safe_for_codex_scopes": ["..."],
  "must_not_dispatch_to_codex": ["..."]
}
```

## Routing Rules

- Any **blocker** ⇒ do not create a task-graph yet.
- Schema migration without a backwards-compatible reader strategy ⇒ `revise_plan_before_task_graph`.
- ML feature/label change without a PIT/leakage gate ⇒ `revise_plan_before_task_graph`.
- External repo/tool without security/supply-chain review ⇒ `needs_research`.
- Task requiring broad exploratory cross-file reasoning ⇒ include in `route_to_claude`.
- Live-trading, secrets, irreversible migration, auth boundary, or capital-risk ambiguity ⇒ `human_review_required`.

## Human-Readable Summary

The `.md` file must be concise and include:

- Verdict
- Top blockers
- Top major risks
- Contradictions between reviewers
- Task-graph constraints
- Dispatch decision
- What must be verified before merge

## Constraints

- No OpenRouter or external routing API.
- No API keys, secrets, passwords, tokens, or `.env` content in any artifact.
- If any input contains a secret, redact it and note the redaction.
