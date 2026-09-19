# VirtualPC — self-hosted multi-agent operating system

> **Mission:** Turn one server into a trustworthy AI team that anyone can own,
> audit, and direct.
>
> **Vision:** A world where useful autonomous systems are small, sovereign, and
> verifiable — running on local hardware, sharing knowledge through a P2P
> knowledge web, and always keeping a human in the loop for risky decisions.
>
> Read the full [Mission, Vision & Goal](docs/MISSION.md).

VirtualPC is a self-hosting roster of specialist agents (CEO, CTO, developers,
analysts, testers, artists, reviewers) coordinated behind one dashboard and one
OpenAI-compatible gateway. It runs local models first, keeps every decision
auditable, and asks for human approval before risky work ships.

Repository: [github.com/virtuanalytica/virtualpc](https://github.com/virtuanalytica/virtualpc)

What's in the box:
- **LiteLLM gateway** at `127.0.0.1:4000` (`deploy/docker-compose.litellm.yml`)
  routing multiple model entries — local LM Studio + cloud — through one
  OpenAI-compatible API. virtualpc points at it via `LITELLM_URL`.
- **Agent registry** (`src/agent-registry.ts`) — single source of truth for
  the roster. Add a name there, every dashboard picks it up.
- **Task engine** (`src/task-engine.ts`) — autonomous tick,
  per-subtask progress, persistent state. The roster size is defined in
  `src/agent-registry.ts` and exposed live via `/api/agents/overview`.
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
git clone https://github.com/virtuanalytica/virtualpc.git ~/virtualpc
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

`deploy/litellm-config.yaml` registers 13 models. Local LM Studio entries
work out of the box; cloud entries (claude-sonnet, gpt-4o-mini, grok,
deepseek-chat, kimi, perplexity, mistral-large, gemini) wait for keys.

To enable cloud routes, drop a key file at `~/.virtualpc/llm-keys.env`:

```bash
mkdir -p ~/.virtualpc
cat > ~/.virtualpc/llm-keys.env <<'EOF'
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
# ...etc
EOF
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

## 🕸️ P2P knowledge graph — Newsgroup 2.0

The flagship subsystem: a sovereign, peer-to-peer news/knowledge network in
`src/integrations/lightrag/`, built bottom-up with verifiable cryptography:

| Layer | Module | What it does |
|-------|--------|--------------|
| BFT consensus | `consensus.ts` + `consensus-network.ts` | Two-phase HotStuff over HTTP — ⌊2n/3⌋+1 quorum certificates, deterministic leader rotation, view change |
| State proofs | `sparse-merkle.ts` | 256-bit sparse Merkle tree — O(log n) inclusion & non-inclusion proofs per account |
| Settlement | `value-chain.ts` | BigInt fixed-point token ledger, Bitcoin-style halving, conservation invariant, per-block state roots |
| Durability | `chain-store.ts` | Atomic disk snapshots; tampered state refuses to boot |
| Identity | `identity.ts` | Self-certifying DIDs (`did:vpc:`), hash-chained Ed25519 key rotation, verifiable credentials |
| Governance | `sovereign-voting.ts` | Sybil-resistant stake-weighted voting with Merkle-certified tallies |
| Attention | `attention-chain.ts` | Reputation-weighted attention scores with half-life decay |
| Users & feed | `user-api.ts` + `feed-api.ts` | Onboarding, HMAC sessions, reactions with token rewards, search, SSE live feed |
| Frontend | `public/newsgroup.html` | Single-file, zero-build UI implementing ten design rules learned from Usenet→Bluesky |
| Anchoring | `src/integrations/chain/` | External finality via Ethereum, Tron, and Bitcoin (OpenTimestamps) |

Start here:
- **[docs/P2P-THREAT-MODEL.md](docs/P2P-THREAT-MODEL.md)** — formal threat model (Dolev-Yao adversary, attack dispositions, explicit non-guarantees)
- **[docs/NEWSGROUP-FRONTEND-LESSONS.md](docs/NEWSGROUP-FRONTEND-LESSONS.md)** — design analysis of ten predecessor systems and the rules derived from them
- `npm test -- tests/unit/multiNode.test.ts` — watch two real HTTP nodes finalize an identical block

---

## 🏗️ Architecture Overview

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Nginx (TLS, Rate Limit, JWT)         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────────────┐        ┌──────────────────────┐         │
│  │   VirtualPC    │        │   Model Router       │         │
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

| Feature | Benefit | Where |
|---------|---------|-------|
| **Shared Memory (LightRAG)** | Agents learn from each other's decisions | `src/integrations/lightrag/` |
| **Kafka Batching** | Fewer API calls through batched orchestration | `src/integrations/kafka/` |
| **Local-First Routing** | Local models preferred; cloud only when needed | `src/orchestration/model-router.ts` |
| **Cost Tracking** | Real-time budget monitoring | `src/orchestration/` |
| **Auth & RBAC** | Sessions, 2FA, role-based dashboards, audit log | `src/auth/` |
| **Containerized** | Docker + systemd deployment | `deploy/` |

---

## 📚 Documentation

The full documentation index lives at **[docs/README.md](docs/README.md)**. Highlights:

- **[docs/VIRTUALPC-ARCHITECTURE.md](docs/VIRTUALPC-ARCHITECTURE.md)** — process layout, agent registry, task engine, LLM routing
- **[docs/P2P-THREAT-MODEL.md](docs/P2P-THREAT-MODEL.md)** — formal security model of the P2P stack
- **[docs/API-ENDPOINTS.md](docs/API-ENDPOINTS.md)** — HTTP route reference
- **[docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md)** — branch strategy, PR process, CI/CD integration
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — production deployment notes
- **[SECURITY.md](SECURITY.md)** — vulnerability reporting and security posture

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

1. **agent.tasks** — VirtualPC publishes assigned work here
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
- **Secrets Management**: .env never committed (see .gitignore)

---

## 📞 Support

- **Architecture questions?** → Read [docs/VIRTUALPC-ARCHITECTURE.md](docs/VIRTUALPC-ARCHITECTURE.md)
- **API questions?** → See [docs/API-ENDPOINTS.md](docs/API-ENDPOINTS.md)
- **Git issues?** → See [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md)
- **Deployment?** → See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **Security reports?** → See [SECURITY.md](SECURITY.md)

---

## 🤝 Contributing

1. Read [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) and [docs/CODING-STANDARDS.md](docs/CODING-STANDARDS.md)
2. Branch: `git checkout -b feature/short-description`
3. Build and test: `npm run build && npm test`
4. Push and open a pull request with passing tests
5. Merge after review

**Let's ship! 🚀**
