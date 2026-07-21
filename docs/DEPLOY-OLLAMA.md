# Deploy VirtualPC with Ollama

This guide runs VirtualPC against a local or remote [Ollama](https://ollama.com) server. This is the cheapest way to get started: no per-token cloud bills and full data sovereignty.

---

## What you need

- A machine with at least **16 GB RAM** (32 GB recommended) and an optional GPU.
- macOS, Linux or Windows with WSL2.
- `git`, `node` 18+, `npm`, `docker` and `docker compose`.
- Ollama installed: https://ollama.com/download

---

## 1. Install Ollama and pull models

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh

# Pull the models VirtualPC agents use by default
ollama pull qwen3.5:27b
ollama pull phi4
ollama pull deepseek-r1:8b
ollama pull devstral-small:22b
ollama pull gemma4:26b
ollama pull nomic-embed-text
```

> Use quantized tags that fit your VRAM/RAM. On CPU-only machines, smaller tags such as `qwen3.5:14b` or `phi4` work best.

Verify:

```bash
ollama list
ollama run phi4 "Hi"
```

Ollama exposes an OpenAI-compatible endpoint at:

```
http://localhost:11434/v1/chat/completions
```

---

## 2. Configure LiteLLM to route to Ollama

VirtualPC uses LiteLLM as a single gateway. Point it at Ollama by editing `deploy/litellm-config.yaml` (or the file referenced by `deploy/docker-compose.litellm.yml`):

```yaml
model_list:
  - model_name: qwen3.5-27b
    litellm_params:
      model: ollama/qwen3.5:27b
      api_base: http://host.docker.internal:11434

  - model_name: phi-4
    litellm_params:
      model: ollama/phi4
      api_base: http://host.docker.internal:11434

  - model_name: deepseek-r1
    litellm_params:
      model: ollama/deepseek-r1:8b
      api_base: http://host.docker.internal:11434
```

On Linux, use the host IP instead of `host.docker.internal`, e.g. `http://172.17.0.1:11434` or `http://<HOST_IP>:11434`.

Make sure Ollama is reachable from inside the LiteLLM container:

```bash
# From the host
curl http://localhost:11434/api/tags
```

---

## 3. Install VirtualPC

```bash
git clone https://github.com/virtuanalytica/virtualpc.git ~/virtualpc
cd ~/virtualpc
cp .env.example .env
```

Edit `.env`:

```bash
PORT=3100
LITELLM_URL=http://127.0.0.1:4000
JWT_SECRET=change_this_value
ADMIN_PASSWORD=change_this_password
```

Run the installer:

```bash
./scripts/install.sh
```

This builds the Node app, starts Docker infrastructure and registers systemd units.

---

## 4. Start services

```bash
systemctl --user start virtualpc
systemctl --user start virtualpc-litellm
```

Check health:

```bash
curl http://localhost:3100/api/health
curl http://localhost:4000/health/liveliness
```

Open the dashboard:

```bash
open http://localhost:3100/dashboard.html
```

---

## 5. Run without Docker (developer mode)

If you prefer to skip Docker for the app itself:

```bash
npm ci
npm run build
npm start &
```

Then start LiteLLM manually:

```bash
docker run -p 4000:4000 \
  -v $(pwd)/deploy/litellm-config.yaml:/app/config.yaml \
  ghcr.io/berriai/litellm:main-latest \
  --config /app/config.yaml
```

---

## 6. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `connection refused` to Ollama | Ensure Ollama is running: `ollama serve` |
| Docker cannot reach `host.docker.internal` | Use host IP or run Ollama in host network mode |
| Out of memory | Pull smaller quantized models (`:14b`, `:8b`) or add swap |
| Slow generation | Use a GPU; set `num_gpu` in Ollama model options |

---

## Next steps

- Add API keys for cloud fallbacks in `~/.virtualpc/llm-keys.env`.
- Read `docs/DATA-SCIENCE-WIKI.md` to let agents work on ML pipelines.
- Read `docs/DEPLOYMENT.md` for the full infrastructure overview.
