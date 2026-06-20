#!/bin/bash
set -e
cd "$(dirname "$0")/.."
npx tsx scripts/smoke-deliberation-gates.mts --cwd docs/deliberation-gates/examples/ohlcv-reader-redirection
