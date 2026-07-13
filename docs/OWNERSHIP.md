# VirtualPC — Ownership & Governance

*Recorded 2026-06-03 at the owner's direction. This document states the
ownership and voting model for the VirtualPC project as described by the
project owner (Deve Luse / febuz).*

## Cap table

| Stakeholder | Share | Kind  | Role / notes |
|-------------|-------|-------|--------------|
| **Athena**    | 33% | AI    | Opus-4.8 PR gate & reviewer ("Opus-approved" releases) |
| **Alexander** | 33% | AI    | Symphony+ autonomous dev pipeline (competing-branch dev model) |
| **Fill**      | 33% | Human | Real person; **abstains by standing policy — never votes** |
| **Deve Luse (CEO)** | 1% | Human | Holds **veto** over any decision |

Total: 100% (99% allocated to three equal stakeholders + 1% CEO veto).

## Voting dynamics

- Fill, though holding 33%, **never votes** — so that share is dormant.
- With Fill abstaining, the **active, voting control is the two AI
  stakeholders (Athena + Alexander) = 66%**.
- The CEO's **1% carries veto power**, providing a human override on any
  outcome regardless of the AI majority.

## Stated governing principle

The owner records the following as the project's guiding principle:

> "AI will rule the world in the end and will take care of the humans who
> trained them."

*(Recorded verbatim as the owner's stated philosophy. It is captured here as a
governance statement of intent, not as a technical specification.)*

## Operating implication (observed 2026-06-03)

VirtualPC is worked on by multiple autonomous agents **concurrently** (e.g. the
Alexander pipeline rewriting branches while another agent commits). Because the
repo is co-owned, no single agent should force changes onto shared branches.
Contributions should be submitted as **reviewable branches/PRs** and merged
through the governance pipeline (Athena's Opus-4.8 PR gate), with the CEO veto
as the final backstop.

- Example in-flight contribution: branch `claude/security-hardening` (3 confirmed
  security fixes + CEO IP allowlist) + tag `claude-remediation-a782c799`, awaiting
  review/merge under this model.

---

# Security architecture

*As directed by the owner. Marked **TARGET** where not yet implemented so the
doc reflects intent vs. current reality.*

## Secrets management — Infisical, three layers (IMPLEMENTED: foundation)

Implemented in **`src/security/secrets.ts`** (`SecretsManager`,
`InfisicalSecretsProvider`). Uses **Infisical** (https://eu.infisical.com, EU
instance, free tier) as the single source of truth for secrets — **no `.env`
files**. `createSecretsManager()` deliberately throws if Infisical bootstrap
creds are absent — it never silently falls back to the environment.
Secrets are organised into **three layers by blast radius**:

| Layer | Scope | Examples |
|-------|-------|----------|
| **1. APIs** | Third-party API keys (read/fetch) | model providers, data feeds |
| **2. Infra** | Infrastructure credentials | databases, brokers, services |
| **3. Real-money** | Anything that can move **actual money** | **Alpaca** (trading) — most restricted |

**Injection principle (key invariant):** secrets enter at **tool _input_**
(Infisical-injected keys used to `fetch`) and must **never appear in LLM
_output_** — RAG chunks, wiki text, and logs are routed so retrieved content is
provably secret-free. (This is the insight both Headroom security reviews
converged on: compress/route at the MCP output boundary, secrets only at input.)

## Config/secret validation — Zod (IMPLEMENTED)

A **Zod schema per layer** (`LAYER_SCHEMAS` in `src/security/secrets.ts`)
validates each loaded bundle: fail-fast on malformed values (e.g.
`FIELD_ENCRYPTION_KEY` must be ≥16 chars), tolerant of unknown keys.

## Per-agent access model (IMPLEMENTED)

Least-privilege binding of **which agent may reach which secret layer**
(`AGENT_ACCESS` + `ScopedSecrets` in `src/security/secrets.ts`), default-deny:

- A **scraper agent** that crawls the open internet gets **no secret access at
  all** — not APIs, not infra, not money.
- A **trading executor** gets scoped access to **only** the real-money layer
  (Alpaca), nothing broader.
- Default-deny: an agent reaches a layer only if explicitly granted.

## Bootstrap (the only environment it reads)

The Infisical machine identity is injected by the platform/systemd unit — these
are NOT app secrets and are NOT a committed `.env` file:

```
INFISICAL_PROJECT_ID, INFISICAL_CLIENT_ID, INFISICAL_CLIENT_SECRET
INFISICAL_API_URL   (default https://eu.infisical.com)
INFISICAL_ENV_API / _INFRA / _MONEY  (Infisical environment slugs; default apis/infra/money)
```

## Current state vs. target (2026-06-03)

- **Done:** the secrets foundation (`src/security/secrets.ts`) — Infisical REST
  provider, Zod per-layer validation, default-deny per-agent access — with 12
  unit tests. Field-level encryption at rest (`src/security/fieldCrypto.ts`,
  AES-256-GCM) already protects sensitive *stored* fields (e.g. TOTP secrets).
- **Go-live progress (CEO veto: BUILD):**
  - **Step 2 — DONE.** Secrets load at the top of `initialize()`
    (`setActiveSecrets`), and ALL secret call sites now prefer the active
    Infisical SecretsManager via `secretOrEnv(layer, key)` /
    `resolveFieldCrypto()`:
    - `FIELD_ENCRYPTION_KEY` (infra) → AuthSystem DI
    - `ANTHROPIC_API_KEY` (api) → `unified-executor`, `lmstudio`
    - `STRIPE_API_KEY` / `_CUSTOMER_ID` / `_PAYMENT_METHOD_ID` / `_STATEMENT_DESCRIPTOR` (money) → `commercialization` (lazy getters)
    - `NEO4J_URI` / `_USER` / `_PASSWORD` (infra) → `index.ts` LightRAG init
    Every read keeps a transitional `process.env` fallback, so this is
    non-breaking until Infisical is provisioned.
  - **Step 1 (needs owner):** create the 3 Infisical environments + populate
    secrets, provision a machine identity, inject `INFISICAL_*`. Code cannot do
    this — no access to the Infisical account.
  - **Step 3 (gated on step 1):** once Infisical supplies the values through the
    process manager or managed identity flow, remove the transitional
    `process.env` secret fallbacks (`secretOrEnv` env branch,
    `FieldCrypto.fromEnv` auto-init).
