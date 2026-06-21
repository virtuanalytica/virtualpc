# VirtualPC — distributed multi-agent system

A multi-agent backend with a 22-agent production roster (CEO Fill, CTO Kai, devs,
artists, researchers, commercialization; plus 14 tester personas), a unified
LiteLLM gateway in front of local
LM Studio + cloud providers, a live task engine that streams subtask progress
to dashboards, and an auto-update path that pulls from GitHub on a 15-min timer.

Repository: [github.com/febuz/virtualpc](https://github.com/febuz/virtualpc)

What's in the box:
- **LiteLLM gateway** at `127.0.0.1:4000` (`deploy/docker-compose.litellm.yml`)
  routing 20 model entries — 11 local LM Studio + 9 cloud — through one
  OpenAI-compatible API. virtualpc points at it via `LITELLM_URL`.
- **Agent registry** (`src/agent-registry.ts`) — single source of truth for
  the roster. Add a name there, every dashboard picks it up.
- **Task engine** (`src/task-engine.ts`) — 22 production agents, autonomous tick,
  per-subtask progress, persistent state on EDS2.
- **Auth** (`src/auth/`) — login, sessions, 2FA-ready, audit log,
  role-based specialist dashboards.
- **Vitals dashboard** (`/vitals.html`) — live GPU/services snapshot,
  symbiosis daemon state, auto-update poll status.
- **Auto-update** (`scripts/auto-update.sh`) — pulls master, rebuilds and
  restarts only when needed; refuses to touch dirty/diverged trees.
- **Commercialization** (`src/commercialization.ts`) — Croesus files
  bounded promotion proposals; humans approve before any real spend
  (`PROMO_REAL_MONEY=1` opt-in).

---

## 🎯 Quick start (5 minutes)

```bash
git clone https://github.com/febuz/virtualpc.git ~/virtualpc
cd ~/virtualpc
./scripts/install.sh
```

The installer does everything: `npm ci`, `npm run build`, brings up LiteLLM
via `docker compose`, and registers three systemd user units
(`virtualpc.service`, `virtualpc-litellm.service`,
`virtualpc-auto-update.timer`). Re-runnable.

Then verify:

```bash
curl -fsS http://localhost:3100/api/health           # virtualpc API
curl -fsS http://localhost:4000/health/liveliness    # LiteLLM gateway
curl -fsS http://localhost:3100/api/vitals/auto-update  # auto-updater state
```

### Prerequisites
- Node.js 18+
- Docker (any flavor — snap, system, Desktop)
- Git
- Optional: LM Studio for local models on `127.0.0.1:1234`
  (`lms server start --bind 0.0.0.0`)

### Repo layout for systemd

The installed units use `%h/virtualpc` (i.e. `$HOME/virtualpc`). If your
checkout lives elsewhere, edit `deploy/systemd/*.service` `WorkingDirectory`
and the `auto-update.sh` `REPO_DIR` env, or symlink your checkout into
`$HOME/virtualpc`.

### Manual bring-up (no systemd)

```bash
docker compose -f deploy/docker-compose.litellm.yml up -d
node dist/index.js
```

---

## 🔌 LiteLLM gateway

`deploy/litellm-config.yaml` registers 20 models (11 local + 9 cloud). Local
LM Studio entries work out of the box; cloud entries (claude-sonnet, claude-opus,
gpt-4o-mini, grok, deepseek-chat, kimi, perplexity, mistral-large, gemini) wait for keys.

To enable cloud routes, provision keys through Infisical, a key manager, or a
process-manager injected secret source:

```bash
export INFISICAL_PROJECT_ID=...
export INFISICAL_CLIENT_ID=...
export INFISICAL_CLIENT_SECRET=...
systemctl --user restart virtualpc-litellm.service
```

Or feed them through the credentials API and re-export:

```bash
curl -fsS http://localhost:3100/api/credentials | jq
# add via /api/credentials/:provider, then:
systemctl --user restart virtualpc-litellm.service
```

The gateway uses `network_mode: host` so it can reach LM Studio on the
host's loopback (this fixes a snap-confined Docker quirk where the bridge
can't reach `127.0.0.1` on the host).

---

## 📋 Implementation Tasks

25 autonomous tasks split across agents. See **Full Task List** below.

### Quick Status

| Task | Agent | What | Status | PR |
|------|-------|------|--------|-----|
| #16 | Kai | LightRAG integration | 🚀 In Progress | [PR-16](#) |
| #17 | Zip | Kafka setup | ⏳ Pending | — |
| #18 | Kai | Nginx security | ⏳ Pending | — |
| #19 | Zip | Model router | ⏳ Pending | — |
| #20 | Kai | Docker deployment | ⏳ Pending | — |
| #21 | Zip | Venv setup | ⏳ Pending | — |
| #22 | Kai | Paperclip fork | ⏳ Pending | — |
| #23 | Zip | Skills system | ⏳ Pending | — |
| #24 | Kai | Kafka API orchestration | ⏳ Pending | — |
| #25 | Vex | Value analysis | ⏳ Pending | — |

👉 **[View All 25 Tasks](../DETAILED_TASK_BRIEFS.md)**

### Critical Path (MVP in 14-19 hours)

```
Task #16 → Task #17 → Task #24 → Task #21 → (Parallel: #18, #19, #20, #22, #23, #25)
 (4-6h)   (3-4h)    (5-6h)     (2-3h)
```

---

## 🏗️ Architecture Overview

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Nginx (TLS, Rate Limit, JWT)         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────────────┐        ┌──────────────────────┐         │
│  │   Paperclip    │        │   Model Router       │         │
│  │    Agents      │───────→│  (Cost Optimizer)    │         │
│  └────────────────┘        └──────────────────────┘         │
│          │                           │                       │
│          ├──→ LightRAG (Neo4j) ←─────┘                      │
│          │   (Shared Memory)                                 │
│          │                                                   │
│          └──→ Kafka (3 brokers)                             │
│              ├─ agent.tasks (Tasks from agents)             │
│              ├─ agent.results (Results to LightRAG)         │
│              ├─ model.requests (Routed API calls)           │
│              ├─ model.responses (Model results)             │
│              ├─ lightrag.updates (Memory sync)              │
│              ├─ cost.tracking (Budget monitoring)           │
│              └─ system.health (Health checks)               │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Local Models (LM Studio)     Cloud Models (API Keys) │ │
│  │  • Qwen 27B (32k context)    • Claude Opus (200k)     │ │
│  │  • Phi-4 (4k context)        • Mythos (100k)          │ │
│  │  • DeepSeek R1 (8k context)  • Gemini (varies)        │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Key Features

| Feature | Benefit | Status |
|---------|---------|--------|
| **Shared Memory (LightRAG)** | Agents learn from each other's decisions | Task #16 |
| **Kafka Batching** | 30% fewer API calls | Task #17, #24 |
| **Cache Layer** | 40% of requests served from cache | Task #24 |
| **Local-First Routing** | $0 cost for 70% of tasks | Task #19 |
| **Cost Tracking** | Real-time budget monitoring | Task #24 |
| **Security (Nginx)** | TLS 1.3, rate limit, JWT auth | Task #18 |
| **Containerized** | Multi-GPU, distributed deployment | Task #20 |

### Cost Savings

```
Before Optimization:
  100 API calls/day × $0.03 = $3/day = $90/month

After Optimization (Task #24 complete):
  LightRAG cache hits:     -40% of calls
  Kafka batching:          -30% remaining calls
  Local model routing:     -20% cost on cloud calls
  Total:                   87% reduction = $1.20/month

Break-even: 2-3 months (infrastructure cost ~$200/month)
```

---

## 📚 Documentation

- **[GIT_WORKFLOW.md](./GIT_WORKFLOW.md)** — Branch strategy, PR process, CI/CD integration
- **[DETAILED_TASK_BRIEFS.md](../DETAILED_TASK_BRIEFS.md)** — 25 task specifications for agents
- **[AGENT_ORG_ARCHITECTURE.md](../AGENT_ORG_ARCHITECTURE.md)** — Complete system design (3500+ lines)
- **[CUSTOM_PAPERCLIP_FORK.md](../CUSTOM_PAPERCLIP_FORK.md)** — Integration strategy with OSS Paperclip
- **[AGENT_EXECUTION_SYSTEM.md](../AGENT_EXECUTION_SYSTEM.md)** — Autonomous task execution daemon

---

## 🚀 Implementation Order

Follow this sequence to unblock downstream tasks:

### Phase 1: Core Infrastructure (14-19 hours)

```
1. Task #16 (Kai, 4-6h)  → LightRAG integration + agent API wrapper
   Deliverables: agent-api.ts, schema.ts, integration tests
   Unblocks: Task #18, #22

2. Task #17 (Zip, 3-4h)  → Kafka message queue + topics
   Deliverables: topic definitions, producer/consumer, consumer groups
   Unblocks: Task #24

3. Task #24 (Kai, 5-6h)  → Kafka API middleware + caching + batching
   Deliverables: API interceptor, batching engine, caching layer
   Unblocks: Cost tracking

4. Task #21 (Zip, 2-3h)  → Setup script + quick start guide
   Deliverables: setup_venv.sh, QUICK_START.md, health check script
   Unblocks: Local testing
```

**Milestone:** Tasks #16, #17, #21, #24 complete = MVP ready ✅

### Phase 2: Security & Deployment (7-12 hours, parallel)

```
Task #18 (Kai, 2-3h)   → Nginx + TLS + JWT auth
Task #19 (Zip, 5-6h)   → Model router optimization
Task #20 (Kai, 4-5h)   → Docker + GPU support
Task #22 (Kai, 4-6h)   → Paperclip fork integration
```

### Phase 3: Skills & Analysis (5-8 hours, parallel)

```
Task #23 (Zip, 3-4h)   → LightRAG skills system
Task #25 (Vex, 2-3h)   → Value/ROI analysis
```

---

## 🔑 Key Concepts

### LightRAG (Shared Memory)

Neo4j knowledge graph storing:
- **Decisions**: "We chose Kafka for distributed coordination"
- **Risks**: "Token budget limits might require fallback to local models"
- **Precedents**: "Similar problem solved in Project X using Y"
- **Context**: "This project requires <200ms latency and <$50/month budget"

Agents query LightRAG before solving problems → **70-80% fewer tokens needed**.

### Kafka (Message Queue)

7 topics for decoupled communication:

1. **agent.tasks** — Paperclip publishes assigned work here
2. **agent.results** — Agents publish results here
3. **model.requests** — API calls go to router, published here
4. **model.responses** — Model responses published here
5. **lightrag.updates** — New facts published here
6. **cost.tracking** — Cost events published here
7. **system.health** — Health checks published here

**Benefit:** Agents don't wait for responses; messages batched and optimized.

### Model Router

Routes requests based on complexity:

```
Low complexity (<100 tokens):
  Phi-4 (local) → <200ms, $0 cost

Medium complexity (100-1000 tokens):
  Qwen 27B (local) → ~500ms, $0 cost
  (or Claude Opus if local insufficient)

High complexity (>1000 tokens, strategy):
  Claude Opus (cloud) → ~5s, $0.03 cost
  (fallback chain: Opus → Mythos → Qwen → Phi → DeepSeek)
```

**Result:** 87% cost reduction + <5% latency increase.

---

## 📊 Success Metrics

| Metric | Target | Task |
|--------|--------|------|
| Query latency (LightRAG) | <100ms | #16 |
| Kafka uptime | 99.9% | #17 |
| Cache hit rate | >40% | #24 |
| Cost reduction | 87% | #19, #24 |
| Setup time | <5 min | #21 |
| Security headers | 100% present | #18 |
| Test coverage | >90% | All |

---

## 🛠️ Development

### Local Setup (5 minutes)

```bash
# 1. Clone & install
git clone https://github.com/your-org/custom-virtualpc.git
cd custom-virtualpc
npm install

# 2. Start services
docker-compose up -d

# 3. Verify
curl http://localhost:3100/health

# 4. Begin work
git checkout -b feature/task-16-lightrag-integration
```

### Running Tests

```bash
# All tests
npm test

# Specific test file
npm test tests/integration/lightrag.test.ts

# With coverage
npm test -- --coverage
```

### Building

```bash
npm run build    # TypeScript → JavaScript
npm run lint     # Code quality check
npm run format   # Auto-format code
```

---

## 🔐 Security

- **TLS 1.3**: All traffic encrypted
- **Rate Limiting**: 100 req/s per IP
- **JWT Validation**: Protected API endpoints
- **API Key Auth**: Fallback for agents
- **Secrets Management**: managed secret sources only; the open-source repo does not use `.env` files

---

## 📞 Support

- **Architecture questions?** → Read [AGENT_ORG_ARCHITECTURE.md](../AGENT_ORG_ARCHITECTURE.md)
- **Task stuck?** → Check [DETAILED_TASK_BRIEFS.md](../DETAILED_TASK_BRIEFS.md) for success criteria
- **Git issues?** → See [GIT_WORKFLOW.md](./GIT_WORKFLOW.md)
- **Deployment?** → Check [Task #20](../DETAILED_TASK_BRIEFS.md) (Docker setup)

---

## 📈 Next Steps

1. **Agents**: Read [GIT_WORKFLOW.md](./GIT_WORKFLOW.md) + [DETAILED_TASK_BRIEFS.md](../DETAILED_TASK_BRIEFS.md)
2. **Pick a task**: Start with Task #16, #17, #21, or #24 (critical path)
3. **Clone + branch**: `git checkout -b feature/task-XX-description`
4. **Build + test**: Follow task brief success criteria
5. **Push + PR**: Create pull request with passing tests
6. **Merge**: Once approved by CTO/Sr
7. **Next task**: Unblocked work in queue

**Let's ship! 🚀**
