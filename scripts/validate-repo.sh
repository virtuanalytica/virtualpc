#!/usr/bin/env bash
# Lightweight repo validation for VirtualPC.
# Checks: stale references, broken shebangs, Python/TS syntax.
# Does NOT require a running server.
set -euo pipefail

cd "$(dirname "$0")/.."

ERRORS=0
WARNINGS=0

fail() { echo "  ✗ $1"; ERRORS=$((ERRORS+1)); }
warn() { echo "  ⚠ $1"; WARNINGS=$((WARNINGS+1)); }
ok() { echo "  ✓ $1"; }

echo "== Stale reference check =="

# Old homes (febuz, knitweb): the repo lives at virtuanalytica/virtualpc now.
FEBUZ_HITS=$(grep -Rin --include='*.ts' --include='*.js' --include='*.sh' --include='*.py' --include='*.html' --include='*.md' --include='*.yml' --include='*.yaml' --include='*.css' \
  'github.com/febuz\|knitweb/virtualpc' src scripts public README.md docs .github .env.example 2>/dev/null || true)
# Exclude this script, allow molgang legacy repos and the roblox user search.
FEBUZ_HITS=$(echo "$FEBUZ_HITS" | grep -v 'validate-repo.sh:\|febuz/molgang-\|roblox.com/search/users?keyword=febuz\|FEBUZ.md' || true)
if [ -n "$FEBUZ_HITS" ]; then
  fail "remaining febuz references:\n$FEBUZ_HITS"
else
  ok "no stale febuz/org references in active code/docs"
fi

# paperclip: legacy brand name; should not appear in active code or user-facing docs.
STALE_NAMES=$(grep -Rin --include='*.ts' --include='*.js' --include='*.sh' --include='*.py' --include='*.html' --include='*.md' --include='*.yml' --include='*.yaml' --include='*.css' \
  'paperclip' src scripts public README.md .env.example .github 2>/dev/null || true)
STALE_NAMES=$(echo "$STALE_NAMES" | grep -v 'validate-repo.sh:' || true)
if [ -n "$STALE_NAMES" ]; then
  fail "remaining paperclip references in active files:\n$STALE_NAMES"
else
  ok "no paperclip references in active files"
fi

echo "== Shebang / loader check =="
for f in scripts/*.mts; do
  [ -f "$f" ] || continue
  first=$(head -1 "$f")
  if echo "$first" | grep -q '^#!/usr/bin/env node'; then
    fail "$f has a node shebang but is .mts (use tsx)"
  else
    ok "$f shebang OK"
  fi
done

echo "== Python syntax check =="
PY_FILES=$(find scripts -maxdepth 1 -name '*.py' -type f 2>/dev/null)
PY_FILES="$PY_FILES $(find data-agents-sidecar -maxdepth 2 -name '*.py' -type f 2>/dev/null)"
PY_FILES=$(echo "$PY_FILES" | tr ' ' '\n' | sort -u | grep -v '^$' || true)
if [ -n "$PY_FILES" ]; then
  if python3 -m py_compile $PY_FILES; then
    ok "all maintained Python files compile"
  else
    fail "Python compile error"
  fi
else
  warn "no Python files found"
fi

echo "== TypeScript type check =="
if npx tsc --noEmit; then
  ok "npx tsc --noEmit passes"
else
  fail "TypeScript type check failed"
fi

echo ""
if [ "$ERRORS" -eq 0 ]; then
  echo "✅ Validation passed ($WARNINGS warnings)."
  exit 0
else
  echo "❌ Validation failed: $ERRORS error(s), $WARNINGS warning(s)."
  exit 1
fi
