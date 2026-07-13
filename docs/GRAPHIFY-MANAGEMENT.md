# Graphify Management

Graphify is optional in VirtualPC. It is a developer/agent knowledge-graph layer,
not a replacement for the built-in `codegraph` API or user-facing chart tools.

## Purpose

- `codegraph` stays the fast built-in structural index for `/api/codegraph/*`.
- Graphify builds a richer AI/codebase knowledge graph under `graphify-out/`.
- Developer agents can optionally be instructed to query Graphify before reading
  raw files.

## Install

```bash
uv tool install graphifyy
```

The VirtualPC server does not require Graphify to boot. When Graphify is absent,
`/api/graphify/status` reports install instructions.

## Build

Default code-only build:

```bash
scripts/graphify-management.sh build-code
```

Semantic build over code plus docs:

```bash
GRAPHIFY_BACKEND=ollama scripts/graphify-management.sh build-semantic
```

Use a hosted backend only when the scanned content is allowed to leave the
machine:

```bash
GRAPHIFY_BACKEND=claude GRAPHIFY_MODEL=claude-sonnet-4-5 scripts/graphify-management.sh build-semantic
```

Generated artifacts:

- `graphify-out/graph.json`
- `graphify-out/graph.html`
- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/analysis.json`

These are generated management artifacts and are gitignored.

## Dashboard/API

Read-only status:

```bash
curl http://127.0.0.1:3100/api/graphify/status
curl http://127.0.0.1:3100/api/graphify/report
```

Dashboard builds and project-scoped developer installs are disabled by default.
Enable them explicitly:

```bash
VIRTUALPC_GRAPHIFY_MANAGEMENT_ENABLED=true npm run dev
```

Then use the dashboard's `Knowledge -> Graphify` page or call:

```bash
curl -X POST http://127.0.0.1:3100/api/graphify/build \
  -H 'content-type: application/json' \
  -d '{"mode":"build-code"}'
```

## Developer Access

Project-scoped installs are opt-in. They write assistant-specific instruction
files into this repository so developers' local agents prefer the graph before
raw search.

```bash
scripts/graphify-management.sh install-claude-project
scripts/graphify-management.sh install-codex-project
scripts/graphify-management.sh install-claw-project
```

Review the resulting files before committing them. Do not enable hosted semantic
extraction for private/customer data unless the data residency decision has been
made explicitly.

