#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="${VIRTUALPC_URL:-http://127.0.0.1:3100}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to verify VirtualPC corpus endpoints" >&2
  exit 2
fi

if ! curl -fsS "$API/api/corpus/stats" >/tmp/virtualpc-corpus-stats.before.json; then
  echo "VirtualPC is not answering $API/api/corpus/stats" >&2
  echo "Start VirtualPC and Neo4j first, then rerun this script." >&2
  exit 1
fi

echo "VirtualPC corpus before:"
cat /tmp/virtualpc-corpus-stats.before.json
echo

echo "Ingesting local source/docs/knowledge corpus..."
node "$ROOT/scripts/ingest-corpus.js"
corpus_rc=$?

echo "Syncing wiki knowledge tier into corpus..."
python3 "$ROOT/scripts/wiki-knowledge-sync.py" --api "$API"
wiki_rc=$?

echo "Ingesting operational discussions..."
node "$ROOT/scripts/ingest-discussions-into-corpus.js"
discussions_rc=$?

if curl -fsS "$API/api/corpus/stats" >/tmp/virtualpc-corpus-stats.after.json; then
  echo "VirtualPC corpus after:"
  cat /tmp/virtualpc-corpus-stats.after.json
  echo
fi

echo "Exit summary: corpus=$corpus_rc wiki=$wiki_rc discussions=$discussions_rc"
if [ "$corpus_rc" -ne 0 ] || [ "$wiki_rc" -ne 0 ]; then
  exit 1
fi
