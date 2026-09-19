# Features

Tracks shipped and planned capabilities by epic. Completed items reflect merged PRs as of 2026-06-24.

---

## Epic 1 — Architecture & Agent Ports

### Shipped
- IdentityResolverPort / IdentityCustodian port extraction (#1)
- Lightweight Data-* agent delegation (#4)
- Tail-read unbounded gpu-symbiosis log (fix) (#9)
- execSync timeout for model-router hardware probes (#8)

---

## Epic 2 — Security

### Shipped
- Bind to localhost by default + enforce write-auth when network-exposed (#6)
- Fix command injection in executeInTerminal (shell string → execFile) (#7)
- npm audit vulnerability remediation (#10)
- Mechanical Python lint cleanup (#11)

---

## Epic 3 — Knitweb / Lens Integration

### Shipped
- MVP development: exponential recency-weighted voting (#2)
- LensAdapter: LLM agent bridge to pulse Lens (#12)

### Planned
- Phase 2: Lens-driven AR overlay rendering in VirtualPC
- MeTTa atomspace integration for agent reasoning

---

## Epic 4 — Ingest Pipeline

### Shipped
- Text extraction adapters for PDF/HTML/JSON/TXT (P2-B) (#15)
- Rule-based relation extraction (P2-C) (#16)

### Planned
- P2-D: CID-addressed node weaving into pulse Web
- P2-E: Delta-sync for incremental re-ingest

---

## Epic 5 — Docs & Backlog

### Shipped
- VirtuAnalytica cleanup — remove legacy references (#3)
- Backlog: agent army + VirtualPC Demo outstanding tasks (#14)
