# Four-tier polyglot architecture — MOLGANG / VirtualPC

**Status:** DESIGN BASELINE · implementation tracked separately  
**Version:** 0.1

“Four-tier polyglot” is used here as a project architecture label, not as an
industry standard. Each tier has one clear responsibility and an explicit
contract with the next tier.

## Tier 1 — Presentation and clients

- MOLGANG Web: Next.js/TypeScript, WebGPU/WebGL fallback.
- Roblox: Lua client/server gameplay and Restaurant Mahjong table.
- Unity 6: asset-gallery and XR review client when Unity is installed.
- Snap AR/Spectacles: Lens Studio geospatial presentation using the shared GLB
  catalog and location anchors.

Client rules:

- Clients send intent, never authoritative task, score, inventory or wallet
  mutations.
- P2P/IPFS assets are content-addressed and may fall back to a packaged local
  asset.
- Pulse events are labeled `local`, `signed`, or `on_chain`; no adapter means
  no on-chain claim.

## Tier 2 — Gateway and orchestration

- VirtualPC Node.js/TypeScript on `127.0.0.1:3100`.
- REST for browser and tooling compatibility.
- WebSocket/Socket.IO for live task and playtest events.
- Rate limiting, local-only binding, export routes, audit logging and agent
  routing live here.

Contract rules:

- JSON contracts are versioned (`virtualpc.export.v1`, game event versions).
- Long-running work is asynchronous and returns an id/status endpoint.
- Gateway endpoints expose source-backed statistics only; no hardcoded demo
  progress or token usage.

## Tier 3 — Application and domain services

- Python FastAPI: chemistry, mahjong validation, player/inventory and audio
  routes already present in MOLGANG Web.
- TypeScript VirtualPC: task engine, agent roles, token accounting, P2P/Pulse
  orchestration and review gates.
- Lua: Roblox authoritative turn loop and restaurant gameplay.
- Future Rust/Go services are optional only after a measured bottleneck.

Communication choice:

- REST/JSON first for public local demo APIs and cross-language portability.
- WebSocket for live UI updates.
- gRPC only when profiling demonstrates high-volume internal calls where REST
  overhead matters; do not add it as ceremony in 0.1.

## Tier 4 — Polyglot persistence and operations

- JSON/JSONL snapshots on EDS2 for the 0.1 VirtualPC state and audit exports.
- IPFS for immutable 3D asset content-addressing.
- Ethereum is the settlement/provenance anchor, preferably an EVM-compatible
  L2 for gameplay-scale writes. Store compact identifiers, hashes, ownership,
  settlement and emitted event references on-chain; keep large assets and
  mutable gameplay state off-chain.
- Pulse journal/hash chain remains the local signed event layer. A real
  Ethereum contract adapter is a separate deployment gate; `on_chain` is never
  reported until a confirmed transaction receipt exists.
- PostgreSQL/Redis/vector storage remain planned integrations, not claims of
  being operational in the fresh baseline.
- Blender/Unity/Snap asset build outputs are reproducible artifacts, not live
  game state.

### Ethereum persistence boundary

| Data | Authoritative home | Ethereum representation |
| --- | --- | --- |
| Wallet ownership, asset rights and settlement | Ethereum/L2 contract | compact ids, balances and receipts |
| Asset bytes and manifests | IPFS/P2P with EDS2 build cache | CID or digest anchor |
| Live match, Mahjong hand and session state | domain service + EDS2/PostgreSQL later | signed event digest only when required |
| Agent tasks, worklog and exports | VirtualPC JSON/JSONL, PostgreSQL later | optional export-root digest |
| Cache, presence and transient queues | Redis later / gateway memory | not on-chain |
| Agent retrieval embeddings | vector store later | not on-chain |

The first contract candidate is `GameEventAnchor`: it accepts a schema version,
event hash, asset-CID digest and actor, then emits an indexed anchor event.
`PulseRegistry` may reference approved Pulse manifests, but neither contract is
deployed in the 0.1 demo. Mainnet deployment requires a threat model, contract
tests, gas limits, wallet/network configuration and an external security review.

## Required contracts

- `AssetManifest`: id, CID, runtime format, source format, SHA-256 and fallback.
- `GameEvent`: event id, actor, match/session, type, payload schema, timestamp,
  previous hash and provenance status.
- `TaskExport`: schema, version, generated time, stats, backlog, worklog and
  token summary; implemented at `/api/export/backlog`.
- `AgentTask`: owner role, input, output artifact, review gate and evidence.

## Acceptance criteria

- [ ] A contract test proves one event can travel Web → VirtualPC → Python and
  back as a versioned JSON response.
- [ ] Roblox, Web, Unity and Snap asset manifests resolve the same CID or an
  explicit local fallback.
- [ ] A failure in one tier produces a visible degraded status, not fabricated
  success.
- [x] Data-role ownership is recorded for schema, lineage, retention and export
  in MOLGANG `shared/agent-review-contracts.json` and covered by the
  four-tier contract test.
- [ ] Ethereum adapter tests cover chain id, nonce/replay handling, receipt
  confirmation, event decoding and explicit `local`/`signed`/`on_chain` status.
- [ ] An L2 testnet demo anchors one export or game event by digest; no gameplay
  asset bytes or private player data are written to the chain.
