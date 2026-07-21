# Gither/Grok Build → pure-Python ClaudeClaw_Fill harness

Status: `blocked-on-preflight`

This is a VirtualPC coordination item, not an instruction to start agents
immediately. The ClaudeClaw_Fill harness must be healthy and reviewed before
any dependent MOLGANG 0.1 task moves from `pending` to `in-progress`.

## Source

- Upstream: <https://github.com/xai-org/grok-build>
- Repository: `xai-org/grok-build`
- Reviewed upstream commit: `a881e6703f46b01d8c7d4a5437683546df30449d`
- Upstream license reported by GitHub: Apache-2.0
- Upstream description: coding-agent harness and interactive TUI
- Target: pure Python implementation on the VirtualPC stack

The port must preserve attribution and license notices. It must not copy
undocumented services, credentials, or provider-specific secrets.

## Agent ownership

| Stage | Owner | Required output |
|---|---|---|
| Harness preflight and unlock | Fill | VirtualPC/ClaudeClaw_Fill capability probe, dry-run receipt, unlock decision |
| Source inventory and boundary | Kimi | upstream-to-Python mapping, supported/unsupported interface record |
| Python port and adapter | Zip | isolated pure-Python package/CLI, offline provider mock, draft PR |
| VirtualPC integration | Kai | task context, tool ACL, EDS2 workspace boundary, provenance receipt |
| UX and agent acceptance | Mira | TUI/player-facing acceptance notes and scoped PR feedback |
| Principal PR review | Athena | security, tests, license, data-egress and reproducibility review |
| Final arbitration | Alexander | explicit merge authorization or request-changes decision |

## Acceptance gates

1. `claudeclaw_fill` harness health is green on the VirtualPC stack.
2. A dry-run dispatch proves agent identity, task context, tool permissions,
   workspace boundary, evidence capture and draft-PR handoff.
3. The Python port runs without the upstream runtime as a required dependency.
4. Offline tests cover provider failure, retry, cancellation and malformed
   tool output; secrets never appear in logs or receipts.
5. The VirtualPC backlog remains the source of truth and no dependent MOLGANG
   item starts before this file's preflight is accepted.
6. Athena reviews every candidate PR; Alexander is the final arbiter.
7. Merge authorization stays `false` until explicit human coordination and
   all evidence gates are recorded.

## Live VirtualPC task links

These were created through `POST /api/backlog/items` and must remain pending
until the preflight is accepted:

- `task-1784621289645-582` — Fill: ClaudeClaw_Fill harness preflight
- `task-1784621289656-172` — Kimi: Grok Build integration research
- `task-1784621289659-197` — Kai: VirtualPC adapter and bridge
- `task-1784621289661-153` — Zip: offline smoke and PR handoff
- `task-1784621289664-415` — Athena: mandatory PR review
- `task-1784621289666-77` — Alexander: final arbiter
- `task-1784621312818-730` — Zip: pure-Python port

No implementation is authorized by this document alone; the agents must raise
reviewable PRs and attach reproducible evidence to their tasks.
