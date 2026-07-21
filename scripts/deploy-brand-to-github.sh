#!/usr/bin/env bash
# Deploy Loom, KnitNet, Fiber and Plexus brand sites to separate GitHub accounts.
#
# Usage:
#   export GITHUB_TOKEN_LOOM="ghp_..."
#   export GITHUB_TOKEN_KNITNET="ghp_..."
#   export GITHUB_TOKEN_FIBER="ghp_..."
#   export GITHUB_TOKEN_PLEXUS="ghp_..."
#   bash scripts/deploy-brand-to-github.sh loom-textus knitnet-fabric fiber-textus plexus-archive
#
# Or run without env vars and type tokens when prompted.

set -euo pipefail

BRANDS=("$@")
if [ ${#BRANDS[@]} -eq 0 ]; then
  echo "Usage: $0 <account1> <account2> <account3> <account4>"
  echo "Example: $0 loom-textus knitnet-fabric fiber-textus plexus-archive"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$ROOT_DIR/tmp/brands"

echo "Regenerating brand pages..."
python3 "$ROOT_DIR/scripts/generate-brand-pages.py"

for account in "${BRANDS[@]}"; do
  brand="${account%-*}"  # e.g., loom-textus -> loom
  if [[ "$brand" == knitnet* ]]; then
    brand="knitnet"
  fi

  token_var="GITHUB_TOKEN_$(echo "$brand" | tr '[:lower:]' '[:upper:]')"
  token="${!token_var:-}"

  if [ -z "$token" ]; then
    read -rsp "Enter GitHub personal access token for $account: " token
    echo
  fi

  site_dir="$TMP_DIR/$account"
  rm -rf "$site_dir"
  mkdir -p "$site_dir/logos"

  echo "Preparing $brand site for account $account..."

  if [ "$brand" == "knitnet" ]; then
    cp "$ROOT_DIR/public/knitnet.html" "$site_dir/index.html"
    cp "$ROOT_DIR/public/logos/knitnet-logo.svg" "$site_dir/logos/"
  else
    cp "$ROOT_DIR/public/$brand.html" "$site_dir/index.html"
    cp "$ROOT_DIR/public/logos/$brand-logo.svg" "$site_dir/logos/"
  fi

  cat > "$site_dir/README.md" <<EOF
# $brand.github.io

Brand website for the **$(echo "$brand" | sed 's/.*/\u&/')** line of the VirtualPC fabric.

- Brain / machine: https://github.com/virtuanalytica/virtualpc
- Brand hub: https://knitweb.github.io/virtualpc/brands.html
EOF

  cd "$site_dir"
  git init -q
  git checkout -q -b main 2>/dev/null || git checkout -q main
  git add .
  git commit -q -m "Deploy $brand brand site" || true
  git remote remove origin 2>/dev/null || true
  git remote add origin "https://${token}@github.com/$account/$account.github.io.git"

  echo "Pushing $brand site to https://github.com/$account/$account.github.io.git ..."
  git push -q -f origin main || {
    echo "Failed to push $brand. Make sure the repository $account/$account.github.io exists and the token has repo scope."
    exit 1
  }

done

echo "Done. Enable Pages in each repository if this is the first deploy."
