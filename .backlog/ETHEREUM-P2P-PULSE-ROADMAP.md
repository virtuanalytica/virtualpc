# Ethereum / P2P / Pulse roadmap — MOLGANG 0.1

**Status:** planned, not deployed

## Scope

Ethereum provides settlement and verifiable provenance. IPFS/P2P provides
content-addressed asset distribution. Pulse provides the local signed event
journal. VirtualPC remains the gateway and review/orchestration layer.

## Delivery gates

1. Define and version `GameEvent`, `AssetManifest` and `TaskExport` schemas.
2. Implement a pure local adapter with deterministic digest generation and
   `local`/`signed`/`on_chain` status transitions.
3. Add an EVM testnet adapter for `GameEventAnchor`; verify chain id, nonce,
   replay protection, receipt confirmation and indexed event decoding.
4. Anchor one sanitized export-root digest and one asset-manifest digest on an
   L2 testnet. Keep GLB/FBX bytes, hands, chat, telemetry and private player
   data off-chain.
5. Add an indexer/read model so Web, Roblox tooling, Unity 6 and Snap AR read
   confirmed anchors without querying the chain in every frame.
6. Require threat modeling, gas/cost limits, key management and independent
   contract review before any production or mainnet deployment.

## Non-goals for 0.1

- No real-money promise, token sale or mainnet deployment.
- No wallet signing in the local demo unless the user explicitly enables it.
- No claim that a Pulse event is on-chain without a transaction receipt.
