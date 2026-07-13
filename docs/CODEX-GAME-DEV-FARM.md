# Codex Game Developer Farm

VirtualPC's dashboard agents are useful for planning, but real game development
needs real Codex workers. The farm scripts launch detached Codex developers that
work in isolated git worktrees and report status under `data/codex-game-dev/`.

## Commands

```bash
npm run codex:game-dev:status
npm run codex:game-dev:start
npm run codex:game-dev:restart
npm run codex:game-dev:stop
```

`start` defaults to the current spare CPU capacity:

```text
auto workers = max(1, min(VPC_CODEX_MAX_WORKERS, cpu_cores - ceil(load1) - VPC_CODEX_RESERVE_CORES))
```

On this 96-core machine, if load is 93 and reserve is 1, the farm starts 2
workers. When the machine is idle, it can scale much higher.

## Worker Behavior

Each worker:

- runs `codex exec` with `--sandbox workspace-write` and `--ask-for-approval never`;
- uses `nice` and `ionice` so foreground work keeps priority;
- gets a role such as gameplay, 3D pipeline, 4D simulation, Roblox/Rojo,
  Three.js/WebGL, playtest automation, or build engineering;
- works in `data/codex-game-dev/workspaces/codex-game-dev-NNN`;
- writes logs and JSON status under `data/codex-game-dev/`;
- loops with `VPC_CODEX_COOLDOWN_SEC` between runs until stopped.

## Sizing

Useful environment knobs:

```bash
VPC_CODEX_MODEL=gpt-5.5
VPC_CODEX_MAX_WORKERS=32
VPC_CODEX_RESERVE_CORES=1
VPC_CODEX_COOLDOWN_SEC=90
```

To intentionally saturate more cores:

```bash
scripts/codex-game-dev-farm.sh restart --count 32
```

The coordinator should review worker branches before merging. Workers must not
merge to `main`.
