# MOLGANG Agent Operability

**Purpose:** ensure VirtualPC agents can operate the MOLGANG/SmartSlag software stack through stable, auditable entrypoints.

## Agent Commands

VirtualPC agents can use the existing OpenClaw API:

```bash
curl -fsS http://127.0.0.1:3100/api/openclaw/command \
  -H 'Content-Type: application/json' \
  -d '{"agent":"Kai","command":"molgang-readiness"}'
```

Supported MOLGANG commands:

| Command | Effect | Script |
|---|---|---|
| `molgang-readiness` | Read-only readiness check for VirtualPC, MOLGANG repo, Blender, assets, docs, API services | `scripts/molgang-agent-readiness.sh --json` |
| `molgang-delegate-smartslag` | Push SmartSlag3 M1 work packages into the VirtualPC backlog API | `scripts/delegate-smartslag-roadmap.js` |
| `molgang-delegate-roadmap` | Push the broader MOLGANG roadmap into the VirtualPC backlog API | `scripts/delegate-molgang-roadmap.js` |

## Human/NPM Entry Points

```bash
npm run molgang:readiness
npm run molgang:readiness:json
npm run molgang:delegate-smartslag:dry
npm run molgang:delegate-smartslag
```

## Local Resource Contract

The readiness check verifies:

- VirtualPC source, agent registry, OpenClaw handler, and operational scripts.
- MOLGANG repo at `/home/knight2/molgang-roblox`.
- SmartSlag spec at `docs/SMARTSLAG_RESEARCH_NETWORK.md`.
- Asset registry, glTF assets, Blender scripts, and GPU scheduler.
- Flatpak Blender (`org.blender.Blender`).
- Node/npm/git/flatpak/curl.
- VirtualPC API on `:3100` and LiteLLM on `:4000` when running.

Warnings are acceptable for optional services that are not currently running. Failures mean agents cannot fully operate the stack and must resolve the missing path/tool first.

## Safety Boundary

OpenClaw only runs whitelisted scripts. It does not expose arbitrary shell execution. Client/WebGPU compute results must remain server-validated before rewards or research outputs are accepted.
