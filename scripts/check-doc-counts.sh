#!/usr/bin/env bash
# Doc-drift guard (sprint-12201 doc-audit follow-up).
# Fails if README count claims diverge from the source-of-truth files:
#   - production agents = non-tester entries in src/agent-registry.ts
#   - model entries     = model_name: lines in deploy/litellm-config.yaml
# Wire into CI / pre-commit so doc drift cannot silently recur.
set -euo pipefail
cd "$(dirname "$0")/.."

REG=src/agent-registry.ts
CFG=deploy/litellm-config.yaml
README=README.md
fail=0

# source-of-truth counts
total_agents=$(grep -cE "\{ name:\s*'" "$REG")
tester_agents=$(grep -cE "kind:\s*'tester'" "$REG")
prod_agents=$((total_agents - tester_agents))
models=$(grep -cE "^\s*- model_name:" "$CFG")

# claimed counts in README (first agent-roster number, first model-entries number)
claim_agents=$(grep -oE "[0-9]+-agent production roster" "$README" | grep -oE "^[0-9]+" | head -1 || true)
claim_models=$(grep -oE "[0-9]+ model entries" "$README" | grep -oE "^[0-9]+" | head -1 || true)

echo "source-of-truth: production agents=$prod_agents (total $total_agents - tester $tester_agents), models=$models"
echo "README claims  : agents=${claim_agents:-?}, models=${claim_models:-?}"

if [ "${claim_agents:-}" != "$prod_agents" ]; then
  echo "ERROR: README agent count ($claim_agents) != registry production agents ($prod_agents)"; fail=1
fi
if [ "${claim_models:-}" != "$models" ]; then
  echo "ERROR: README model count ($claim_models) != litellm-config models ($models)"; fail=1
fi

if [ "$fail" -eq 0 ]; then echo "OK: README counts match source of truth"; fi
exit $fail
