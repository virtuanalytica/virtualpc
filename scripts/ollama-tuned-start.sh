#!/bin/bash
# Start Ollama with hardware-aware tuning (max concurrent streams + keep-alive)
# Usage: ./scripts/ollama-tuned-start.sh [optional_max_streams]
#
# If not specified, max_streams is dynamically calculated based on:
#   - CPU cores (50% usage target = floor(cores/2), capped at 16)
#   - RAM (60% usable for model weights)
#   - GPU count (if available: 2 streams per GPU, else CPU-only)

set -e

# Configuration
OLLAMA_PORT=${OLLAMA_PORT:-11434}
OLLAMA_HOST=${OLLAMA_HOST:-127.0.0.1:$OLLAMA_PORT}

# Calculate max concurrent streams (matches throughput-governor logic)
calculate_max_streams() {
  local cores=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 8)
  local gpu_count=$(nvidia-smi -L 2>/dev/null | wc -l || echo 0)

  # CPU-based estimate: 50% usage
  local cpu_streams=$((cores / 2))
  cpu_streams=$((cpu_streams < 4 ? 4 : cpu_streams))  # min 4
  cpu_streams=$((cpu_streams > 16 ? 16 : cpu_streams))  # cap 16

  # GPU boost: 2 streams per GPU
  local gpu_streams=$((gpu_count * 2))

  # Return max of the two
  local max=$((cpu_streams > gpu_streams ? cpu_streams : gpu_streams))
  max=$((max > 8 ? 8 : max))  # overall cap
  echo "$max"
}

# Get max streams (override via $1 or calculate)
MAX_STREAMS=${1:-$(calculate_max_streams)}

echo "[ollama-tuned-start.sh] Starting Ollama with:"
echo "  - OLLAMA_MAX_LOADED_MODELS: $MAX_STREAMS"
echo "  - OLLAMA_NUM_PARALLEL: $MAX_STREAMS"
echo "  - OLLAMA_HOST: $OLLAMA_HOST"

# Start Ollama with tuned settings
export OLLAMA_MAX_LOADED_MODELS=$MAX_STREAMS
export OLLAMA_NUM_PARALLEL=$MAX_STREAMS
export OLLAMA_HOST="$OLLAMA_HOST"
export OLLAMA_KEEP_ALIVE=30m

# Launch (foreground for systemd/docker, background if shell)
if [[ -t 0 ]]; then
  # Interactive terminal: run in background
  ollama serve &
  OLLAMA_PID=$!
  echo "[ollama-tuned-start.sh] Ollama running (PID $OLLAMA_PID)"
  wait $OLLAMA_PID
else
  # Piped/redirected: run in foreground
  exec ollama serve
fi
