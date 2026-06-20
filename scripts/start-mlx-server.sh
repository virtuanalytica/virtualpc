#!/usr/bin/env bash
# Start the local MLX server for the VirtualPC demo dashboard.
set -euo pipefail
cd "$(dirname "$0")/.."
VENV="./.venv-mlx"
MODEL="${MLX_MODEL:-mlx-community/Qwen2.5-0.5B-Instruct-4bit}"
PORT="${MLX_PORT:-1234}"
echo "Starting MLX server with ${MODEL} on port ${PORT}..."
"${VENV}/bin/mlx_lm.server" --model "${MODEL}" --port "${PORT}"
