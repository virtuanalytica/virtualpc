# VirtualPC — Architecture

**Status:** Production
**Repo:** `github.com/virtuanalytica/virtualpc`
**Last refresh:** 2026-05-04

VirtualPC is a project-agnostic multi-agent orchestration backend. It is
the platform; whatever your team is building plugs into it through the
task engine, the Kafka event bus, the data-governance registry, and the
LiteLLM gateway. There are no domain-specific assumptions in the core —
agents, tasks, models, tools, and dashboards are all pluggable.

---

## 1. Process layout

```
                              ┌──────────────────────────┐
 Browser  ──────────────────▶ │  Dashboard (port 3100)   │
                              │  • virtualpc.service     │
 Claude Code (skills) ──────▶ │  • Express + Socket.IO   │ ◀── /api/mcp/*
                              │  • TaskEngine            │     (tool dispatch
                              │  • Kami brief queue      │      with per-agent
                              └────┬─────────────────────┘      ACL)
                                   │
        ┌──────────────────────────┼──────────────────────────┬────────────────────┐
        │                          │                          │                    │
        ▼                          ▼                          ▼                    ▼
 ┌────────────────┐  ┌────────────────────────────┐  ┌──────────────────┐  ┌──────────────────┐
 │ Kafka 9092     │  │  Knowledge layer           │  │ LiteLLM 4000     │  │ Local services   │
 │ (7 topics)     │  │                            │  │ • LM Studio 1234 │  │ • Redis (caches) │
 │ • model.resp   │  │  ┌──────────────────────┐  │  │ • Kimi CLI       │  │ • EDS2 1.1 TB    │
 │ • agent.tasks  │  │  │ LightRAG (Neo4j 7687)│  │  │ • Claude CLI+Kami│  │   asset store    │
 │ • agent.results│  │  │ ─ governance graph   │  │  │ • Cloud APIs     │  │ • molgang-backup │
 │ • task.failed  │  │  │ ─ wiki + npc memory  │  │  │ • nomic-embed    │  │   weekly timer   │
 │ • cost.tracking│  │  │ ─ asset registry     │  │  │   (corpus vectors)│  └──────────────────┘
 │ • commit.audit │  │  │ ─ Corpus passages    │  │  └──────────────────┘
 │ • lightrag.upd │  │  │   + vector index     │  │
 └────────────────┘  │  │   (32G heap+64G pgcache)│  │
                     │  └──────────────────────┘  │
                     │  ┌──────────────────────┐  │
                     │  │ GitNexus (codegraph) │  │
                     │  │ ─ AST symbols 397+   │  │
                     │  │ ─ imports/exports    │  │
                     │  │ ─ fan-in / fan-out   │  │
                     │  │   /api/codegraph/*   │  │
                     │  └──────────────────────┘  │
                     └────────────────────────────┘
```

**Knowledge layer** is the pair of graphs every agent queries before
reasoning. They answer different questions and stack — see § 10 for
the dual-graph design rationale.

All systemd user units (`virtualpc.service`, `virtualpc-litellm.service`,
`virtualpc-auto-update.timer`, `molgang-backup.timer`) are installed by
their respective `scripts/install-*.sh` helpers. Unit files live in
`deploy/systemd/`.

---

## 2. Agent registry — single source of truth

`src/agent-registry.ts` exports `AGENT_META`. Every other module (task
engine, token tracker, dashboard, MCP ACL, LLM router, scrum/forum
hooks) imports from this one file.

The roster currently ships **31 personas** in 8 kinds:

| Kind                  | Count | Agents |
|-----------------------|-------|--------|
| `core`                | 6     | Fill, Kai, Zip, Mira, Luna, Pixel |
| `decision`            | 3     | Cleopatra, Alexander, MoneyGod |
| `resource`            | 2     | Analyst, VideoProducer |
| `specialist`          | 4     | Vice, Atlas, Kimi, Croesus |
| `governance`          | 1     | Governor |
| `hermes-coordinator`  | 5     | Hermes-Roblox, Hermes-Web, Hermes-Marketing, Hermes-Cross, Hermes-Reviewer |
| `tester`              | 10    | 4 Roblox + 4 Web + 2 Marketing |

Each entry carries: `name`, `role`, `avatar`, `color`, `kind`, `models`,
`teams[]` (scrum membership), `tools[]` (MCP tool ACL with wildcards
like `governance.*`).

Persona prompts live in `data/agent-prompts.json` and surface in the
dashboard's All-Agents page via `/api/agents/overview` and
`/api/agents/:name/prompt`.

---

## 3. Task engine

`src/task-engine.ts` is a single-process, in-memory task store with
JSON persistence (`data/tasks.json` + `logs/work-log.jsonl`). It owns:

- **Tasks** — id, title, status, priority, assigned_to, subtasks,
  progress.
- **Proposals** — agent-to-agent inbox/outbox messages.
- **Artifacts** — outputs from real LM Studio runs.
- **Work log** — every subtask completion timestamp + minutes-spent
  record.

The engine ticks every few seconds (`tickEngine()`), nudges in-progress
tasks forward, and emits CLI-log lines per agent that drive the
dashboard's live activity feed. State persists with a dirty-flag + 5-second save
interval, so a SIGKILL after SIGTERM loses ≤ 5 s of work.

Mutator endpoints:

| Endpoint                              | Effect                              |
|---------------------------------------|-------------------------------------|
| `POST /api/backlog/:id/status`        | flip pending↔in-progress↔completed  |
| `POST /api/backlog/:id/priority`      | change priority tier                |
| `POST /api/backlog/items`             | inject a new backlog item           |
| `GET  /api/backlog/per-person`        | full per-agent task tree            |
| `GET  /api/agents/:name/inbox`        | proposals received                  |
| `GET  /api/agents/:name/outbox`       | proposals sent                      |
| `GET  /api/agents/:name/cli-log`      | recent CLI activity                 |

---

## 4. Kafka messaging — the spine

Kafka is **central**, not an optional add-on. Every model call, task
mutation, and inter-agent message is published; the audit + cost
consumer subscribes to all of it. Single-broker dev mode at
`127.0.0.1:9092`; promote to multi-broker in production unchanged.

### 4.1 Topics

| Topic                | Producer                         | Consumer               | Payload |
|----------------------|----------------------------------|------------------------|---------|
| `model.responses`    | every `chatAsAgent` call         | audit, cost-rollup     | { agent, model, prompt_tokens, completion_tokens, latency_ms, ts } |
| `agent.tasks`        | task-engine `addTask` / status   | audit                  | { task_id, agent, title, status, priority } |
| `agent.results`      | task-engine `setStatus(completed)` | audit                | { task_id, agent, artifact_ref, completed_at } |
| `task.failed`        | task-engine on retry exhaustion  | self-heal              | { task_id, agent, error, attempts } |
| `cost.tracking`      | audit consumer (rollup)          | dashboard              | { agent, model, tier, usd_estimate, window } |
| `lightrag.updates`   | governance-graph + asset-graph   | future replicas        | { node_type, content, created_by, affects[] } |
| `commit.audit`       | git-hook                         | audit                  | { sha, author, task_ids[], ts } |

### 4.2 Audit + cost consumer

`src/integrations/kafka/audit-consumer.ts` subscribes to all 7 topics,
appends every event to `data/kafka-audit.jsonl` (replay log), and
maintains a per-agent / per-model spend rollup in `data/kafka-cost.json`
that the dashboard reads. Tier 1 (local) is recorded with $0 cost; tier
2/3 estimates use OpenAI/Anthropic published rates.

### 4.3 Producer wire

`src/integrations/kafka/shared.ts` holds a module-level singleton
producer with reconnect backoff. The `chatAsAgent`, `addTask`, and
`setTaskStatus` paths all best-effort-publish on success — failures log
but never break the parent request. KAFKA_BROKERS env var enables;
omit to noop (dev offline mode).

---

## 5. LLM routing

`src/lmstudio.ts` is the multi-tier router. **Three CLI bridges** live
alongside the LiteLLM gateway:

| Path                            | Trigger                                               | Purpose |
|---------------------------------|-------------------------------------------------------|---------|
| LiteLLM → LM Studio (default)   | any local model hint                                  | bulk chat / code / reasoning |
| `chatViaKimiCli` (Moonshot)     | `agent === 'Kimi'`                                    | long-context research (200K+) |
| `chatViaClaudeCli` (Anthropic)  | designer agents + `taskType === 'design'` OR `taskType === 'docs'` (KAMI_FOR_DOCS=1) | high-quality design / typeset docs (Kami auto-triggers) |

### 5.1 Per-agent + per-task-type routing

- `AGENT_MODEL_ROUTES` — preferred model per agent.
- `TASK_TYPE_ROUTES` — `concept` → gemma-4-26b, `code` → devstral,
  `reasoning` → deepseek-r1, `design` → claude-sonnet,
  `docs` → claude-sonnet (Kami flow).

Fallbacks are deterministic: Kimi unavailable on a non-docs call →
phi-4; Claude unavailable on a `docs` call → gemma-4-26b (long-context
plain-prose, no Kami styling).

### 5.2 Tier costs

| Tier | Examples                        | Where              |
|------|---------------------------------|--------------------|
| 1    | phi-4, gemma-4-26b, devstral, deepseek-r1 | LM Studio (free) |
| 2    | Kimi Moonshot, mistral-7b       | paid CLIs          |
| 3    | Claude Sonnet/Opus, GPT-4-class | API gateway        |

If a 26B model fails to load under memory pressure, the router falls
back to phi-4 automatically and logs the substitution.

---

## 6. Tool-use coordination (MCP)

`src/integrations/mcp/registry.ts` is the in-house MCP-shaped tool
catalogue. **20 tools** at the time of writing, all schema-validated +
ACL-enforced:

| Namespace      | Tools |
|----------------|-------|
| `codegraph.*`  | stats, symbol, file |
| `governance.*` | list, lineage, register |
| `wiki.*`       | lookup, upsert |
| `assets.*`     | search |
| `scrum.*`      | standup, standups, bug, bugs, summary |
| `forum.*`      | read, post, reply |
| `kami.*`       | queue, briefs, deliver |

Per-agent ACL on `AgentMeta.tools` (wildcards: `governance.*`, `*`).
Calls that bypass the ACL get a 403 with the calling agent's actual
rule set — debuggable in one round-trip.

HTTP surface: `GET /api/mcp/tools[?agent=…]`, `POST /api/mcp/call` with
`{ agent, tool, args }`.

Why MCP, not OpenAI Symphony: see `docs/TOOL-USE-COORDINATION.md`.
Symphony orchestrates issue queues; we needed tool-call coordination,
which MCP was designed for. Both Claude CLI and Kimi CLI speak MCP
natively — a future swap to `@modelcontextprotocol/sdk` keeps the
schemas exactly as-is.

---

## 7. Documentation pipeline (Kami)

**Kami** ([tw93/kami](https://github.com/tw93/kami)) is the typeset-doc
flow. It is a Claude Code skill installed at `~/.claude/skills/kami/`
that produces HTML / PDF / slide decks under a parchment + ink-blue
design language across 8 doc types (one-pager, long-doc, letter,
portfolio, resume, slides, white-paper, changelog).

Skills only run **inside** a Claude Code session. virtualpc cannot
recursively invoke `claude` from systemd context (auth + autoloop-hook
recursion). So the architecture is **queue + render**:

```
agent (Mira)        virtualpc                    Claude Code session
  │ POST                /api/kami/queue                │
  │────────────────────▶│  data/kami-briefs.json       │
  │                     │ status=queued                │
  │                     │                              │
  │                     │ ◀────────GET /api/kami/briefs│
  │                     │                              │
  │                     │                  Kami skill  │
  │                     │                  fires here  │
  │                     │                              │
  │                     │  POST .../status=delivered ◀─│
  │                     │                              │
  │                     │ docs/kami/<id>.html written  │
```

`src/integrations/kami/` is the brief queue with statuses
`queued → in-progress → delivered → cancelled`. Persists to
`data/kami-briefs.json` with the same dirty-flag + 5-s save pattern.

Endpoints + MCP tools (`kami.queue`, `kami.briefs`, `kami.deliver`)
mean any agent with the right ACL can request a typeset doc; a Claude
Code session (interactive or scripted) drains the queue.

`scripts/regenerate-docs.js --scope <readme|architecture|wiki|all>` is
the standard project-wide doc-refresh entry point — it queues briefs;
a Claude Code session renders. See `docs/KAMI-DOCS.md` for the full
producer + renderer flow.

---

## 8. Data governance — single lineage layer

`src/integrations/governance/` is the registry of every shared data
artifact: shared/*.json files, asset registries, wiki source-of-truth,
DB schemas, license records.

Each `GovernanceEntry`:

```ts
{
  id, name, kind, owner, source, schema?,
  lineage,           // free text: where it came from + who consumes it
  license,
  tags[],
  updatedAt
}
```

Owned by the **Governor** agent (kind: `governance`). Every wiki entry
carries a `governanceId` so a UI walk recovers the citation chain
(wiki term → governance entry → source file or external attribution).

Endpoints:

| Endpoint                              | Purpose                                |
|---------------------------------------|----------------------------------------|
| `GET  /api/governance`                | list (filter by kind/owner/tag)        |
| `GET  /api/governance/lineage/:id`    | entry + related-by-tag                 |
| `POST /api/governance/register`       | upsert (Governor's MCP ACL gates this) |

Real-time hook: every `register` call also fires
`notifyGovernanceWrite()` → LightRAG node ingest, so the knowledge
graph stays in sync without a separate sync job.

---

## 9. Wiki — game + qchem glossary

`src/integrations/wiki/` stores the molgang glossary (game terms +
quantum chemical engineering terms). Authored by Kimi
(`taskType:'docs'` flow), curated by Governor.

Each `WikiEntry`:

```ts
{
  id, term,
  namespace: 'game' | 'qchem',
  summary,            // 1-line tooltip
  body,               // markdown body
  seeAlso[],          // cross-link ids
  governanceId,       // lineage anchor
  author, updatedAt
}
```

The webgame's `/wiki` page (Next.js) and the dashboard's "Wiki &
Governance" page both render off this surface. Real-time hook:
`upsertEntry` → `notifyWikiWrite()` → LightRAG node with
`affects=[governanceId, ...seeAlso]`.

Endpoints: `GET /api/wiki[?namespace=…&q=…]`, `GET /api/wiki/:id`,
`POST /api/wiki`.

---

## 10. Knowledge layer — GitNexus + LightRAG + Corpus

Three stacked surfaces, each answering a different class of question.
Together they're the prior context every agent should hit before
reasoning from scratch — same answer quality at ~3× lower token cost.

### 10.1 Surfaces

| Surface           | Implementation                          | Answers |
|-------------------|-----------------------------------------|---------|
| **GitNexus** (a.k.a. `codegraph`) | Zero-dep TypeScript indexer at `src/integrations/codegraph/`; Tree-sitter-style AST extraction; cached at `data/codegraph.json` | "Where is X defined?" "Who calls X?" "What does logger.ts import?" |
| **LightRAG** (Neo4j entity graph) | `src/integrations/lightrag/` driving Neo4j 5 at `bolt://127.0.0.1:7687`; entity-typed nodes (Governance / Wiki / Asset / NPCMemory / Decision) with typed relationships | "What's the lineage of fugacity?" "Which assets share tag quantum-chem?" "Why did we pick MCP over Symphony?" |
| **Corpus** (Neo4j vector index + embeddings) | `src/integrations/corpus/`; same Neo4j instance, `:Corpus` nodes carrying 768-dim embeddings via the Neo4j 5 native vector index | "Tell me everything we have on partition functions." "Find passages relevant to liquid-sim implementation." |

### 10.2 Why three (not one)

- **GitNexus** is structural — it knows that `chatAsAgent()` lives in
  `src/lmstudio.ts:391` and is referenced 23 times. Answers questions
  about *code shape*.
- **LightRAG** is relational — it knows that wiki entry `fugacity`
  has `governanceId='wiki-terms-json'` which has `owner='Governor'`
  and `tag='quantum-chemistry'`. Answers questions about *typed
  relationships*.
- **Corpus** is semantic — it can find passages textually similar to
  the query, including ones we've never explicitly classified. Answers
  questions about *what does the body of knowledge say*.

You need all three: a structural query like "what calls
`chatAsAgent`" gives WRONG answers via vector similarity, and a
semantic query like "explain partition functions" gives WRONG answers
via Cypher MATCH.

### 10.3 Memory tier (sized for the box, not for a laptop)

The host has 629 GB RAM. Neo4j was running on 1 GB heap default. As of
2026-05-05 the container runs with:

- `server.memory.heap.initial_size = 8G`
- `server.memory.heap.max_size      = 32G`  *(or 48 G — see §10.7)*
- `server.memory.pagecache.size     = 64G`

Effective Neo4j footprint ~96 GB. Lets the entire corpus (textbooks +
papers + IUPAC + codebase) sit hot in RAM. **Token-cost effect**: an
agent answering "how do I model fugacity at high pressure" today
reasons through ~1500 prompt tokens. With Corpus retrieval first, the
same answer needs ~400 prompt tokens + 6 retrieved passages — same
quality, ~3× cheaper.

### 10.4 Ingest paths

| Source                          | Owner    | Volume       | Script |
|---------------------------------|----------|--------------|--------|
| `shared/asset-registry.json`    | Atlas    | bulk on startup (`asset-graph.ts`) | (auto) |
| Governance + wiki entries       | Governor | bulk + real-time hooks (`governance-graph.ts`) | `ingest-wiki-into-corpus.js` |
| Repo source + docs              | Kai      | corpus-ingest scan, embedded chunks | `ingest-corpus.js` |
| Forum threads + scrum bugs + persona prompts | Kai | bulk on demand | `ingest-discussions-into-corpus.js` |
| Chemistry: 118 elements + 10 recipes + reaction conditions | Atlas | bulk on demand from molgang-web FastAPI | `ingest-chemistry-into-corpus.js` |
| IUPAC Gold Book terminology     | Governor | scheduled fetch + parse | (planned) |
| OpenStax Chemistry 2e (CC-BY)   | Mira     | bulk one-shot | (planned) |
| arXiv chem-ph abstracts         | Kimi     | weekly RSS pull | (planned) |
| PubChem compound summaries      | Atlas    | on-demand REST cache | (planned) |
| Decision rationales (Kafka)     | system   | streamed via `lightrag.updates` topic | (auto) |

### 10.5 Endpoints + MCP tools

```
GET  /api/codegraph/{stats,symbol/:name,file,dependencies,search}
GET  /api/governance/lineage/:id            # LightRAG-backed
GET  /api/corpus/search?q=…&k=8&kind=…      # Corpus, hybrid vector + keyword
GET  /api/corpus/stats                      # total, by_kind, vector_indexed

# MCP tool namespace (per-agent ACL via tools[]):
  codegraph.symbol / codegraph.file / codegraph.stats
  governance.lineage / governance.list / governance.register
  wiki.lookup / wiki.upsert
  corpus.search                              # the "search the world" tool
```

### 10.6 Open-source alternatives — what we considered

The user asked: *"choose something better complementary to GitNexus
and LightRAG if it is open source available."* Survey:

| Tool                  | Class                           | Why we kept Neo4j-native + GitNexus instead |
|-----------------------|--------------------------------|--------|
| **Qdrant**            | Pure-vector DB (Rust)           | Fast and lean — but we'd run a second service for what Neo4j 5's vector index already does. Adds an HTTP hop per query. Re-evaluate when corpus exceeds ~100 M passages. |
| **Weaviate**          | Vector + hybrid + graph         | Heavier than Neo4j; overlaps with LightRAG's role; module-heavy install. |
| **Memgraph**          | In-memory Cypher (faster)       | Promising for big-RAM box. *Worth re-evaluating* — drop-in for Neo4j with same Cypher, claims 100× perf on graph algos. |
| **NebulaGraph**       | Distributed graph               | Overkill for one host. |
| **TerminusDB**        | Git-style versioned graph       | Niche; we already audit-log via Kafka. |
| **DuckDB + DuckDB-VSS** | Single-binary OLAP + vector   | Nice for analytics, but LightRAG's queries are graph-shaped, not analytical. |
| **Apache AGE**        | Postgres property-graph         | Mature; but adds Postgres dependency we don't otherwise need. |
| **LlamaIndex**        | Python retrieval framework      | Application layer, not storage; can sit on top of any of the above. |
| **Vespa.ai**          | Hybrid search engine            | Heavyweight (JVM); same role as Qdrant but slower to set up. |

**Conclusion**: stay on Neo4j 5 + native vector index for v1. Two
deferred options worth a future bake-off:

1. **Memgraph** as a Neo4j swap-in if Cypher latency becomes a
   bottleneck (the box has the RAM for it).
2. **Qdrant** as a dedicated vector tier *only if* the corpus exceeds
   ~100 M passages — at that scale the dedicated index beats Neo4j's
   vector index on QPS by ~5×.

Both are wired into the recommended-pulls list; neither is required
for current scale.

### 10.7 Heap-size note (≤32 GB or ≥48 GB)

JVM compressed-oops boundary is ~32 GB. Above that, pointers go from
4 to 8 bytes — a ~50% overhead per heap object. **Either keep heap
≤32 GB or jump to ≥48 GB to skip the inefficient zone.** Current
config (32 G) sits right at the boundary; bump to 48 G if we see
heap pressure under heavy ingest.

### 10.8 Graceful degradation

LightRAG / Neo4j down → in-memory fallback in the client (§ existing
behavior, unchanged). All endpoints still answer; vector search
returns empty rather than 500. Restart Neo4j and it back-fills from
asset-graph + governance-graph init paths. No data loss because the
canonical sources (governance.json / wiki.json / asset-registry.json)
are filesystem-backed.

---

## 11. Scrum-of-scrums + tester forum

Four scrums + a cross-team coordinator: see `docs/SCRUM-CHARTERS.md`
for the full charter (mission, members, ceremonies per team).

| Team              | Hermes coordinator | Members |
|-------------------|--------------------|---------|
| `scrum-roblox`    | Hermes-Roblox      | Fill, Kai, Mira, Vice + 4 testers |
| `scrum-web`       | Hermes-Web         | Fill, Kai, Zip, Mira, Luna, Atlas, Vice, Pixel + 4 testers |
| `scrum-marketing` | Hermes-Marketing   | Fill, MoneyGod, Analyst, VideoProducer, Croesus, Governor + 2 testers |
| `cross`           | Hermes-Cross       | Fill (chair), Kai, Cleopatra, Alexander, MoneyGod, Kimi, Governor, Hermes-Reviewer |

`src/integrations/scrum/` — standup feed + bug ingestion per team.
`src/integrations/forum/` — threaded discussion (root post + replies).

Testers run continuously: each session, file any defect via
`/api/scrums/:team/bug`, share at least one tip / trick / glitch /
feature-idea to the team's forum at `/api/forum/:team`. Hermes
coordinators digest the feeds daily; Fill + Cleopatra read across
teams via `/api/scrums/cross/standup`.

The `scripts/seed-scrum-tasks.js` helper is idempotent — re-run after
roster changes to ensure every tester has the recurring "play +
report" duty and every Hermes has the daily-digest duty.

---

## 12. Development & review pipeline — competing branches + Opus gate

How a backlog item goes from "picked up" to "released". Three roles, two model
tiers, *more than one* attempt per feature, and a reviewer who reviews like the
most-senior PhD engineer on the team.

### 12.1 Roles

| Role | Who | Model | Job |
|---|---|---|---|
| **Product Owner** | Claude Coordinator | — | Owns the backlog + product catalog ([PRODUCTS.md](PRODUCTS.md)), grooms priorities, **balances who builds what** (§12.5), and **completes the winning branch**. |
| **Principal Reviewer** | **Athena** 🦉 | **Claude Opus 4.8** (the *only* agent on Opus) | The PR gate. Reviews as a senior PhD-level engineer — spots any coding mistake, owns [CODING-STANDARDS.md](CODING-STANDARDS.md) and enforces adherence, relays working parts between competing branches, approves only what works with a clean suite. |
| **Engineers (workers)** | Kai, Zip, Pixel, Luna, Atlas, … | **a spread of advanced coding models** (§12.4) | Implement the feature on a branch + ship unit + regression tests; improve from Athena's feedback. |

The split is deliberate: **one strong reviewer, many fast workers.** Opus is
spent in the one place depth pays off — review — while the workers do the volume
of building.

### 12.2 The competitive loop

For each non-trivial backlog item, **at least two engineers build the same
feature independently, each on their own branch**, using **different** advanced
coding models (§12.4). They do not share code while building — divergent attempts
surface more of the design space than one attempt iterated.

```
                       backlog item (one spec)
                        │                 │
            ┌───────────┘                 └───────────┐
       Engineer A (e.g. Sonnet)                  Engineer B (e.g. Qwen-Coder-32B)
       feat/<item>-A  + tests                    feat/<item>-B  + tests
            │  PR A                                    │  PR B
            └──────────────┐         ┌─────────────────┘
                           ▼         ▼
                ┌──────────────────────────────────┐
                │  Athena (Opus 4.8) reviews BOTH   │
                │  • senior-PhD-engineer scrutiny   │
                │  • runs the WHOLE suite on each   │
                │  • enforces CODING-STANDARDS.md   │
                │  • feedback on A and on B         │
                │  • RELAYS the working part of A   │
                │    to B and vice-versa            │
                │  • approves whatever passes       │
                └──────────────────────────────────┘
                           │
            approved branch(es) ──▶ Product Owner completes the one
                                    they like most (or the only one that
                                    works). Loser closed — its good ideas
                                    were already relayed into the winner.
```

1. **Build.** ≥2 engineers each implement the item on `feat/<item>-<who>`, each
   shipping unit + regression tests for it.
2. **PRs.** Each opens a PR against the same release line.
3. **Review (Opus).** Athena reviews *every* branch as a senior PhD engineer:
   runs the whole jest suite against each (unit + regression on the whole),
   spots any coding mistake, checks every item of CODING-STANDARDS.md, writes
   feedback on each, and — crucially — **relays the working part of one branch
   into the feedback for the other** ("B's persistence layer is solid, A should
   adopt it; A's API shape is cleaner, B should take it"). Workers improve with
   their own feedback *and* the cross-relayed wins from the sibling branch.
4. **Approve.** Athena approves a branch **only** when the feature works, the unit
   + regression suite is clean on the whole (offline-infra integration failures
   are environmental, never a failing unit suite), **and** it adheres to the
   coding standards (`standardsAdhered=false` blocks). Pure, unit-tested logic:
   `src/review/athena-gate.ts` (`decideGate`).
5. **Complete (PO).** Among the approved branches the **Product Owner completes
   the one they prefer**; the engineer who built it owns the completion. If only
   one works, that one ships. Losers are closed; their strengths already live in
   the winner via step 3's relay.

### 12.3 Why two builders, not one

- **Coverage** — two independent attempts explore more of the solution space.
- **Cross-pollination** — the reviewer is a *router of good ideas*; the working
  half of a "losing" branch still ships, grafted into the winner.
- **Model diversity** — different coding models make genuinely different design
  choices, so the two branches are not near-duplicates (§12.4).
- **A real choice for the PO** — completion is a selection among working options.

### 12.4 Worker model diversity — slightly different, all advanced

Workers do **not** all run the same model. Each engineer leads on a distinct,
advanced coding model so competing branches diverge by construction. Athena (the
reviewer) stays on Opus 4.8; every non-engineer agent stays on Sonnet.

| Engineer | Lead model | Notes |
|---|---|---|
| Kai (CTO) | `claude-sonnet` | flagship — infra / cross-team |
| Zip (Dev) | `claude-sonnet` | flagship — web app |
| Pixel (Web Dev) | `qwen-coder-32b` | strong OSS coder |
| Luna (Tech Artist) | `devstral` | Mistral coding model |
| Atlas (CAD/sim) | `deepseek-r1` | reasoning-heavy sim work |

Source of truth: `src/agent-registry.ts` (`models[0]` is the lead). The live map
is at `/api/models/config`; pairings for a feature should put two *different*
models head-to-head.

### 12.5 Balanced workload + delivery overview

The PO keeps assignment **balanced** — no worker starved or overloaded — and
tracks **how many features each worker delivers**.

- Scoreboard logic (pure, tested): `src/review/delivery-scoreboard.ts`
  (`tallyDeliveries`, `balanceReport`) + `tests/unit/deliveryScoreboard.test.ts`.
- Overview runner: `scripts/worker-delivery-overview.ts` — reads merged
  `feat/<item>-<who>` branches, prints per-worker delivery counts, a balance
  report (mean / spread / most- & least-loaded), and the **suggested next
  assignee** (the least-loaded eligible worker).
- The PO assigns the next item to the suggested assignee to keep load even; the
  delivery counts feed the promotion-portfolio model.

---

## 13. HTTP surface (key)

```
# Core
GET  /                           → public/dashboard.html
GET  /api/health                 → liveness probe
GET  /api/agents/overview        → roster + activity
POST /api/llm/chat               → OpenAI-compatible chat for any agent
                                   (agent + messages + taskType)

# Backlog / tasks
GET  /api/backlog/per-person
POST /api/backlog/items
POST /api/backlog/:id/status     POST /api/backlog/:id/priority

# Tool coordination
GET  /api/mcp/tools[?agent=…]    POST /api/mcp/call

# Knowledge
GET  /api/codegraph/{stats,symbol/:name,file,dependencies,search}
GET  /api/governance[?kind=…]    GET  /api/governance/lineage/:id
GET  /api/wiki[?namespace=…&q=…] GET  /api/wiki/:id    POST /api/wiki

# Scrum + forum
GET  /api/scrums                 GET  /api/scrums/:team/{standups,bugs}
POST /api/scrums/:team/{standup,bug}    POST /api/scrums/bug/:id/update
GET  /api/forum/:team            POST /api/forum/:team
GET  /api/forum/thread/:id       POST /api/forum/thread/:id/reply

# Documentation (Kami)
GET  /api/kami/{briefs,summary}  GET  /api/kami/briefs/:id
POST /api/kami/queue             POST /api/kami/briefs/:id/status

# Auto-research
POST /api/autoresearch           GET  /api/autoresearch/agents

# Vitals + auto-update
GET  /api/vitals/auto-update     GET  /api/vitals/{gpu,services,disk}

# Self-heal
POST /api/selfheal/audit         GET  /api/selfheal/audit
```

200+ routes total at present.

---

## 14. Persistence

| Store                          | Role                                          |
|--------------------------------|-----------------------------------------------|
| `data/tasks.json`              | task engine (dirty-flag + 5 s save)            |
| `logs/work-log.jsonl`          | append-only subtask completion log             |
| `data/agent-prompts.json`      | persona prompts                                |
| `data/codegraph.json`          | codegraph cache                                |
| `data/governance.json`         | data-governance registry                       |
| `data/wiki.json`               | glossary entries                               |
| `data/scrum.json`              | standups + bug reports per team                |
| `data/forum.json`              | tester forum threads + replies                 |
| `data/kami-briefs.json`        | Kami doc-brief queue                           |
| `data/kafka-audit.jsonl`       | Kafka replay log (append-only)                 |
| `data/kafka-cost.json`         | per-agent / per-model spend rollup             |
| Neo4j (optional)               | LightRAG knowledge graph                       |
| EDS2 `:/molgang-assets/`       | canonical 3D / texture / audio store (1.1 TB)  |

Every JSON store uses the dirty-flag + 5 s save pattern; SIGKILL after
SIGTERM loses ≤ 5 s of work.

---

## 15. Backups

`molgang-backup.timer` (Sun 02:30 local, `Persistent=true`) drives
`scripts/backup-eds2-assets.sh` — rsync with `--link-dest` for hardlink
dedupe. Off-host target via `BACKUP_TARGET` in
`~/.config/systemd/user/molgang-backup.env`. See `docs/BACKUP.md` for
install + restore drill.

---

## 16. Auth & audit

- `src/auth/` — login, sessions, role-based dashboards. Roles: `ceo`,
  `cto`, `economy`, `creative`, `developer`, `viewer`.
- `src/security/audit-logger.ts` — every mutation logged with actor,
  IP, timestamp, target.
- `src/commit-audit.ts` — every git commit is recorded and linked
  back to the task it delivered (when titles match). Publishes to
  `commit.audit` Kafka topic.

---

## 17. Auto-update + self-heal

`scripts/auto-update.sh` is the systemd timer payload. Every 15 min:

1. `git fetch origin master`.
2. If clean tree + something to pull, `git pull`.
3. If `package.json` or any `*.ts` changed, `npm ci && npm run build`.
4. If `dist/` changed, `systemctl --user restart virtualpc.service`.

Refuses dirty / diverged trees. State at `/api/vitals/auto-update`.

`src/integrations/selfheal/` audits the dashboard for broken links,
dead endpoints, dangling onclicks, orphaned nav items. Pure-local;
no external services. POST `/api/selfheal/audit` to run; results at
`GET /api/selfheal/audit`.

---

## 18. Adding a new agent

1. Append to `AGENT_META` in `src/agent-registry.ts` (name, role,
   avatar, color, kind, models, teams, tools).
2. Optionally add a model-route override in `AGENT_MODEL_ROUTES`
   (`src/lmstudio.ts`).
3. Run `node scripts/delegate-build-overview.js` to have Gemma 4 draft
   a persona prompt; output goes to `data/agent-prompts.json`.
4. If the agent is a tester or Hermes coordinator, also run
   `node scripts/seed-scrum-tasks.js` to inject their recurring duty.
5. Restart the service. Dashboard, MCP ACL, scrum membership, and
   per-agent detail panel all pick up the new agent automatically.

No other files need editing.

---

## 19. Adding a new MCP tool

1. Implement the handler in the right `src/integrations/<area>/` module.
2. Add a `ToolDefinition` to `TOOLS[]` in
   `src/integrations/mcp/registry.ts`. Pick a dotted name in the right
   namespace (e.g. `wiki.export`).
3. Update relevant agent `tools[]` ACLs in `src/agent-registry.ts`.
4. The HTTP + MCP surface picks it up automatically; no route changes.

---

## 20. Adding a new dashboard route

All dashboard pages are static HTML in `public/`, served by Express
static. Sections toggle `.content-section.active` — no SPA framework,
no UI build step.

1. Add `<div class="nav-item" data-page="myroute">` to the sidebar.
2. Add `<div class="content-section" id="myroute">` with the body.
3. If live data, fetch from `/api/...` in the existing `<script>`.

That's the whole frontend pattern.
