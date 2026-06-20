# Modular Architecture — every building block replaceable

The rule, stated once and enforced everywhere:

> **If a building block can cause problems, it must be replaceable —
> otherwise the system falls over with it.** The core depends on ports
> (interfaces with declared capabilities), never on concrete protocols,
> brokers, files, or vendors. Concrete implementations are plugins.

This is what makes the agent/graph stack scalable: nodes with
*heterogeneous implementations* (different transports, different storage
backends, different anchor chains) interoperate as long as the
cryptographic contract holds. The network never has to upgrade in
lock-step, because truth lives in signatures, content hashes and Merkle
roots — not in any particular component (threat model §3.8).

## The layering rule

```
Transport delivers bytes.
Crypto defines truth.
Reducer defines state.
Certificate defines finality.
Anchor defines external timestamp.
```

A failing or compromised plugin at any layer may degrade availability,
never integrity. Swapping a plugin must never require touching the
verification logic.

## Port inventory

| Port | Interface | Implementations | Capability descriptor | Status |
|------|-----------|-----------------|----------------------|--------|
| **Transport** | `TransportAdapter` (`transport-adapter.ts`) | `MqttTelemetryAdapter` (telemetry-only), `LoopbackAdapter`; libp2p gossipsub / Nostr relay / HTTP-3 gateway / Hedera HCS are plug-in candidates | `TransportCapabilities` (`suitableForSecretBallot` / `suitableForTelemetry` / `suitableForCheckpointGossip`, `exposesClientMetadataRisk`) | ✅ Interface-backed; events routed by capability |
| **Snapshot storage** | `SnapshotStorage` (`storage-port.ts`) | `FileSnapshotStorage` (atomic temp+rename), `MemorySnapshotStorage`; S3 / IPFS / encrypted keystore are plug-in candidates | `StorageCapabilities` (`durable`, `atomicWrite`, `remote`) | ✅ Interface-backed; `ChainStore` re-verifies on load, so a hostile backend cannot forge a ledger |
| **Anchor signing** | `AnchorSigner` (`chain/anchor.ts`) | env-key signer; HSM / KMS are plug-in candidates. Targets (`ChainTarget[]`: Ethereum, Tron, Bitcoin-OTS) are configuration, not code | per-target `intervalMs` / chain id | ✅ Interface-backed |
| **PQ key resolution** | `setPqRootResolver(did → root)` (`value-chain.ts`) | wallet-vault enrollment registry | — | ✅ Callback-injected |
| **Event fan-out** | `GroupEventBus` over `TransportAdapter[]` | capability-routed (governance vs telemetry); Kafka as durable internal stream | event `class` decides required capability | ✅ Core never imports a concrete transport |
| **Credential issuer / identity** | `SovereignIdentityService` (concrete) | — | — | ⚠️ Extraction candidate: services take the concrete class; an `IdentityPort` (resolve / verify / receive) would allow external DID registries |
| **k-NN index** | `VectorIndexPort` (`index-port.ts`) | `LinearScanIndex` (exact, the benchmark baseline); HNSW / IVF are plug-in candidates | `IndexCapabilities` (`exact`, `approximate`, `designCapacity`) | ✅ Interface-backed; index returns ids+scores only — rows come from the authoritative store, so a hostile index cannot fabricate rows (CI-asserted) |
| **Graph persistence (Neo4j)** | best-effort mirror | — | — | ✅ By design a *cache, not truth* (threat model §3.6) — replaceable because losing it loses nothing |

## Data exchange: metadata makes data modular

A record is exchangeable across module and node boundaries only when it
says what it is. Every exchanged event/fact therefore carries:

| Field | Purpose |
|-------|---------|
| `schema` | self-describing type id, e.g. `vpc.group-event/1` — version bumps are new schemas, never silent shape changes |
| `class` | transport-capability class (`governance` \| `telemetry` \| `secret-ballot`) — decides which adapters may carry it |
| `eventHash` / `rowHash` | content address over the canonical body — dedupe + integrity, independent of transport and of metadata enrichment |
| `ts` | producer timestamp (never trusted for ordering — HLC/consensus does that) |

Rules:

1. **Consumers skip unknown schemas** instead of failing — forward
   compatibility is what lets heterogeneous nodes coexist.
2. **Metadata never enters the content hash.** Hashes commit to
   `{type, groupId, body}` only, so enriching the envelope can never
   invalidate existing content addresses (CI-asserted in
   `transportAdapter.test.ts`).
3. **The fact matrix is the cross-domain example**: transactions, news,
   votes, backlog items and spectra coexist in one coordinate space
   because every row carries `kind` + `rowHash` + deterministic
   coordinates — domains are separable by construction, and adding a
   domain is one encoder function (see `IDEAGRAPH-BENCHMARK.md`).

## How to add a plugin (the contract)

1. Implement the port interface; declare capabilities **honestly** — the
   router trusts the declaration (a telemetry-only adapter that claims
   `suitableForCheckpointGossip` would receive governance events).
2. Never let the plugin define truth: it moves/stores bytes that are
   signed and content-addressed elsewhere. If your plugin needs the core
   to trust it, the design is wrong.
3. Add the routing/refusal tests mirroring `transportAdapter.test.ts` /
   `chainStore.test.ts §3b` — including the hostile-plugin case
   (tampered bytes must be *rejected*, not absorbed).
4. Register it in the wiring (`index.ts`) behind its env flag; off by
   default.

## What this buys at network scale

Per-node plugin choices (broker vs P2P transport, file vs S3 snapshots,
which chains to anchor to) become **local decisions** invisible to
peers, because the inter-node contract is only: signed canonical events,
content hashes, Merkle roots, certificates. That is the property that
lets the graph grow node-by-node — hashgraph-style, no flag-day
upgrades, no lock-step dependency on any vendor or protocol.
