# Dev Tournament — the 3-developer competing-branch regime

_Established 2026-06-04. Single source of truth: `src/org/dev-tournament.ts`._

VirtualPC develops every feature as a **tournament between three independent
developer legs**. Each leg builds the same feature in parallel on its own branch
with its own resources; one senior PhD reviewer reviews all three; the Product
Owner picks exactly **one** winner to merge.

## Roles

| Role | Model | Effort | Runs via |
|------|-------|--------|----------|
| **Product Owner / Coordinator / Scrum Master** | Claude Opus 4.8 | `max` | main loop |
| **Principal Reviewer** (senior, PhD-level) | GPT-5.5 | `xhigh` | **Codex** (subscription) |

The PO steers the backlog, reads the reviewer's reviews, and selects the winner.
The reviewer reviews each leg's branch and enforces the coding standards.

## The three developer legs

Each leg has a **senior developer**, a **junior team of 2** (lower-tier model
running the leg's own scrum), its **own branch namespace**, and its **own
development resources**. That is 3 legs × (1 senior + 2 juniors) = **9 developer
agents** plus the PhD reviewer and the PO.

| Leg | Senior | Juniors | Branch namespace |
|-----|--------|---------|------------------|
| `gpt` | GPT-5.5 `xhigh` (Codex) | GPT-5.4 `high` (Codex) | `dev/gpt/<feature>` |
| `claude` | Claude Opus 4.8 `xhigh` | Claude Sonnet `high` | `dev/claude/<feature>` |
| `virtualpc` | qwen-coder-32b (local/LiteLLM) | devstral | `dev/virtualpc/<feature>` |

The `gpt` leg runs on the ChatGPT **subscription** via the Codex bridge
(`src/codex`) — no per-token API cost.

## Flow — everything through the backlog

```
1. BACKLOG     PO files a backlog item. Nothing happens off-backlog.
2. POKER       All three teams planning-poker estimate the item (modified
               Fibonacci: 0,1,2,3,5,8,13,21). Consensus = median; if the spread
               is > 1 scale-step the teams re-vote. → pokerConsensus()
3. BUILD       Each leg builds the SAME feature on its own branch with its own
               junior team and scrum. → planBuilds() → dev/<leg>/<feature>
4. REVIEW      The Codex/GPT-5.5 reviewer reviews each branch (works + standards
               + tests) and returns a verdict + score per leg.
5. SELECT      The PO reads the reviews and selects exactly ONE winner: the
               highest-scoring leg that PASSED review (ties → leg order). If no
               leg passed, the feature is rejected for rework. → selectWinner()
6. MERGE       The winning branch merges; the other two are discarded. Every
               step is recorded against the backlog item.
```

## Why competing legs

Three independent attempts from genuinely different model families surface
different bugs and different designs. The reviewer + PO keep only the best, so
quality is set by the strongest of three rather than the luck of one.

## Invariants (enforced by the model + tests)

- Exactly **three** legs, each with a **distinct** branch namespace.
- Every senior runs **hotter** than its own junior team.
- A feature can have **at most one** winner; a winner must have **passed**
  review.
- No leg passing → no merge (feature returns to the backlog for rework).
- Poker consensus requires **all three** teams to vote.
