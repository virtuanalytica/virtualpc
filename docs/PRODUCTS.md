# VirtualPC — Product Catalog

**Owner:** Claude Coordinator (Product Owner) · see [CLAUDE-COORDINATOR-CHARTER.md](CLAUDE-COORDINATOR-CHARTER.md)
**Defined:** 2026-06-03, from the live backlog (`/api/backlog`, 145 items), the
roster (`/api/agents/overview`, 35 agents), the scrum charters, README, and git.
**Status legend:** 🟢 live · 🟡 in build · ⚪ planned

The portfolio has **three products** plus shared platform capabilities. The
strategy has pivoted: **VirtualPC itself is now the flagship commercial
product** (a horizontal agent platform being pitched to investors), with
**MOLGANG** as the showcase application built by the roster, and a **Growth
engine** monetising both.

---

## P1 — VirtualPC Platform 🟢🟡  *(flagship)*

**One-liner:** A horizontal, self-hosting multi-agent operating system — a
35-agent roster that grooms its own backlog, runs scrum ceremonies, writes and
reviews code, and reports live, all behind one OpenAI-compatible gateway.

**Why it's the flagship:** the in-flight backlog is dominated by platform work
(persistence tier, inference backend, activity stream, cost dashboard, agent
UI) and the marketing team is producing an *"investor reel: VirtualPC as a
horizontal platform."* The product being sold is the platform.

**Primary owners:** Kai (CTO), Zip (Dev), Fill (CEO), Mira/Luna (dashboards).

**Shipped (from README + git):**
- 35-agent registry + autonomous task engine with per-subtask streaming
- LiteLLM gateway (`:4000`) — 13 model entries, local LM Studio + cloud
- Auth: login, sessions, 2FA-ready, role-based dashboards, **CEO audit log** (29 unit tests)
- Vitals dashboard (GPU/services/auto-update), self-heal + repair-mode hooks
- Auto-update path (15-min GitHub pull, refuses dirty/diverged trees)
- Corpus/memory: LightRAG + Neo4j, `/corpus.html` search dashboard
- Codegraph (symbol/dependency search), governance + data-lineage registry

**In flight (top of backlog):**
- 🔴 *critical* — Postgres / persistence tier for the task engine (Kai)
- 🔴 *critical* — LM Studio agent-inference backend (Kai)
- 🟠 WebSocket activity stream · Agent inbox/outbox UI · Agent profile live CLI stream (Kai, Zip)
- 🟠 Cost dashboard: per-agent + per-model (MoneyGod) · Latency audit agent→LLM→response (Atlas)
- 🟠 Codebase synthesis / cross-file inconsistency hunt (Kimi)

**Definition of Done:** merged to master, reachable on the live API, covered by
a test or a reproducible curl, no open p0/p1, and reflected on a dashboard.

---

## P2 — MOLGANG: Chemical Engineering Simulator 🟡  *(showcase application)*

**One-liner:** An educational chemistry/chemical-engineering game where
realistic physics + quantum chemistry are the USP. Two editions, one IP.

**Editions:**
- **P2a — Roblox edition** (`scrum-roblox`) — Lua/Roblox-Studio frontend,
  Roblox-native economy, MOLCO2 marketplace, periodic-table GUI, quest engine.
  Owners: Mira, Vice, Kai, Fill + RB testers.
- **P2b — Web edition** (`scrum-web`) — Next.js + Phaser + Three.js port:
  wiki, periodic table, chemistry bench, quest engine, achievements, inventory.
  Owners: Zip, Pixel, Luna, Atlas, Mira + Web testers. **⚠ 31 open bugs** —
  current quality hotspot.

**Game systems in the engine** (`/api/*`): battlepass + XP, shop + inventory,
events + challenges, ranking/tournament, zones (crystal-caverns resonance,
deep-ocean boss/atoms), upload/featured levels.

**Quality bar:** four **GTA6-gap gameplay testers** drive polish —
Sienna (open-world feel), Dante (mission/narrative), Onyx (physics/interaction),
Iris (character/NPC AI) — plus demographic testers per edition.

**In flight / planned:** density & scale design study, simulation-fidelity
audit, realism rubric for personas (Vice, Atlas); animation polish (Luna);
empty-state illustrations, onboarding tour, design-system v2 (Mira).

**Definition of Done:** playable build, tester sign-off across the relevant
persona + GTA-gap dimensions, pedagogical accuracy checked by the curriculum
testers, no open p0/p1.

---

## P3 — Growth & Commercialization Engine 🟡  *(monetisation)*

**One-liner:** The audience + revenue flywheel — investor/marketing content,
competitor intel, the social loop, and bounded, human-gated real-money
promotion.

**Owners:** MoneyGod (economy), Croesus (commercialization), Analyst (data),
VideoProducer (video), Governor (data lineage) — `scrum-marketing`.

**Shipped:** commercialization module — Croesus files bounded promo proposals;
humans approve before any spend; **real-money path correctly refuses without
Stripe credentials** (verified: failing proposals cite missing `STRIPE_API_KEY`).

**In flight / planned:**
- 🟠 Investor reel (2-min platform pitch) · platform overview trailer (90s) · live demo recording rig (VideoProducer)
- 🟠 Stripe customer record + audit-trail (MoneyGod) · per-proposal cap audit (Croesus)
- 🟠 Time-series anomaly detection · A/B test framework · cohort/throughput analysis (Analyst)
- ⚪ Competitive landscape brief · channel-mix analysis · quarterly budget reconciliation

**Hard guardrail:** real money stays a human gate. `PROMO_REAL_MONEY=1` opt-in
only; this product never auto-spends.

**Definition of Done:** artifact delivered (reel/brief/dashboard), metrics
instrumented, and any spend explicitly human-approved with an audit trail.

---

## Shared platform capabilities *(not standalone products)*

These serve the platform products and are funded as infrastructure, not sold
separately: **Governance & data-lineage**, **Corpus/Memory (LightRAG+Neo4j)**,
**Vitals / self-heal**, **Auth & audit**, **LiteLLM model routing**.

---

## Portfolio priorities — this sprint (PO call, 2026-06-15)

1. **Unblock P1 persistence** — the two `critical` items (Postgres tier +
   LM Studio inference) gate durable config for every other product. *Top
   priority.*
2. **Burn down P2b's 31 web bugs** — the showcase can't demo with that bug
   load; it undermines the investor story for P1.
3. **Land the P3 investor reel** — but only against a stabilised P1/P2b, so the
   footage is real.
4. **Keep private vertical products outside this repo** — product-specific GUI,
   role packs, dictionaries, and commercial entitlements live in separate
   private repositories.
5. **Backlog hygiene** — collapse the ~46 duplicate "define task pool"
   placeholders so WIP reflects reality (see charter §5).
