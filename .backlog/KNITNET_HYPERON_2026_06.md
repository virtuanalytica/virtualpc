# KnitNet Hyperon Metagraph - tagged backlog

**Project:** KnitNet Hyperon Metagraph
**Project ID:** `knitnet-hyperon`
**Default tags:** `project:knitnet-hyperon`, `knitnet`, `hyperon`, `metta`, `rlm`, `knowledge-graph`
**Created:** 2026-06-15
**Launch target:** GitHub launch preparation for 2026-06-16

## KN-1 - Designer Rust core

**Project:** KnitNet Hyperon Metagraph
**Tags:** `project:knitnet-hyperon`, `rust`, `designer`, `p2p`, `arity-256`, `blockchain-anchor`
**Owner:** Kai
**Priority:** Critical
**Estimate:** 8h

Build the Rust core prototype for `DesignerNode`, `DesignerEdge`, the 256-edge cap, literature anchors, blockchain anchors, payout metadata, and truth values.

**Acceptance:**
- `DesignerNode::add_edge` rejects edge 257.
- `export_to_timmerman` strips heavyweight metadata into lightweight relation tuples.
- Unit tests cover empty node, valid edge insert, max-edge rejection, and export shape.

## KN-2 - Timmerman MeTTa export

**Project:** KnitNet Hyperon Metagraph
**Tags:** `project:knitnet-hyperon`, `metta`, `timmerman`, `export`, `local-graph`, `apple-silicon`
**Owner:** Kimi
**Priority:** Critical
**Estimate:** 6h

Generate a lightweight MeTTa file from Designer relations for local SLM/RLM use.

**Acceptance:**
- Export emits `(: Node Type)` and `(Relatie A B truth)` atoms.
- Export includes `TrekAanTouwtje` and validation-rule stubs.
- Docs call out that Hyperon/MeTTa is treated as experimental for v1.

## KN-3 - RLM adapter over existing graphs

**Project:** KnitNet Hyperon Metagraph
**Tags:** `project:knitnet-hyperon`, `rlm`, `graphify`, `lightrag`, `codegraph`, `adapter`
**Owner:** Alexander
**Priority:** High
**Estimate:** 5h

Define the adapter layer from current VirtualPC graph sources into KnitNet format: Graphify code graph, LightRAG/governance graph, corpus/wiki, and codegraph.

**Acceptance:**
- One canonical mapping table exists for source node -> Designer node -> Timmerman atom.
- Provenance and freshness metadata are preserved before pruning.
- No new hard runtime dependency on Hyperon is required for dashboard boot.

## KN-4 - Truth and uithalen prototype

**Project:** KnitNet Hyperon Metagraph
**Tags:** `project:knitnet-hyperon`, `truth-value`, `validation`, `pattern-matching`, `quality-gate`
**Owner:** Athena
**Priority:** High
**Estimate:** 5h

Specify and prototype falsification semantics for relation truth values and "uithalen als straf" without real financial slashing.

**Acceptance:**
- Invalid relation votes reduce dependent chain confidence.
- Quality gate can reject a relation chain before payout/signature.
- Test fixtures cover valid, disputed, and falsified chains.

## KN-5 - P2P and invite architecture

**Project:** KnitNet Hyperon Metagraph
**Tags:** `project:knitnet-hyperon`, `libp2p`, `invite`, `github`, `gmail`, `seed-node`
**Owner:** Kai
**Priority:** High
**Estimate:** 6h

Design the P2P layer, seed-node topology, anonymous developer portal, GitHub identity anchor, and Gmail/user invite flow.

**Acceptance:**
- Architecture identifies which data is public, private, hashed, or off-chain.
- Invite and developer-credit flows avoid storing raw private data in the graph.
- Seed-node bootstrap path is documented for consumer hardware.

## KN-6 - Token/legal risk gate

**Project:** KnitNet Hyperon Metagraph
**Tags:** `project:knitnet-hyperon`, `legal`, `token`, `dao`, `payments`, `risk`, `security`
**Owner:** Cleopatra + MoneyGod
**Priority:** Critical
**Estimate:** 4h

Create the explicit no-real-money gate for tokens, slashing, private-key custody, developer payouts, and DAO claims.

**Acceptance:**
- Real tokens, payouts, slashing, and private-key custody are disabled by default.
- Launch docs use "credits" and "prototype" wording unless legal review approves more.
- Security review is required before any on-chain signing path is implemented.

## KN-7 - GitHub launch README and positioning

**Project:** KnitNet Hyperon Metagraph
**Tags:** `project:knitnet-hyperon`, `github-launch`, `readme`, `positioning`, `developer-onboarding`
**Owner:** Fill + Kimi
**Priority:** Critical
**Estimate:** 4h

Prepare the GitHub launch narrative for the Designer/Timmerman split and VirtualPC-managed backlog.

**Acceptance:**
- README section explains Designer, Timmerman, RLM, and why Graphify/Hyperon are relevant.
- Quickstart avoids promising production token economics.
- Screenshots or Graphify report links are included where available.

## KN-8 - Lean marketing strategy

**Project:** KnitNet Hyperon Metagraph
**Tags:** `project:knitnet-hyperon`, `marketing`, `google-ads`, `meta`, `youtube`, `x`, `international`
**Owner:** Croesus + Hermes-Marketing
**Priority:** High
**Estimate:** 5h

Prepare a lean campaign plan for next week across Google, YouTube, Meta, Instagram, X, and international markets.

**Acceptance:**
- Week 0 is GitHub/community-first.
- Paid ads stay low-budget until analytics, landing page, privacy text, and legal-safe token wording exist.
- Localized campaigns for China, Japan, Russia, Indonesia, Germany, and France require translated copy and compliance review before spend.
