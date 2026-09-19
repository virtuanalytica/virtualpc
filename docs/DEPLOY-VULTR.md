# Deploy VirtualPC on Vultr

This guide deploys VirtualPC on a [Vultr](https://www.vultr.com) cloud instance. It covers a standard CPU instance plus the extra steps for a GPU instance if you want local model inference.

---

## What you need

- A Vultr account.
- A domain or Vultr-managed DNS (optional, for HTTPS).
- An SSH key added to Vultr.

Recommended instance sizes:

| Workload | Vultr plan | Notes |
|----------|-----------|-------|
| Demo / small team | 2 vCPU, 4 GB RAM | Use cloud LLMs only |
| Production CPU | 4 vCPU, 16 GB RAM | Docker stack + LiteLLM |
| Local inference | Cloud GPU (NVIDIA A100/L40S) or Bare Metal | See GPU section |

---

## 1. Create the instance

1. Log in to Vultr.
2. Click **Deploy Server** → **Cloud Compute**.
3. Choose **Debian 12** or **Ubuntu 24.04 LTS**.
4. Select a region close to your users.
5. Pick a plan and add your SSH key.
6. Deploy.

Once running, SSH in:

```bash
ssh root@<your-instance-ip>
```

---

## 2. Prepare the server

```bash
apt update && apt upgrade -y
apt install -y git curl wget nano htop docker.io docker-compose-plugin nginx certbot python3-certbot-nginx

# Add your user to docker group
usermod -aG docker root

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

node --version  # v20.x
npm --version   # 10.x
```

---

## 3. Clone and install VirtualPC

```bash
git clone https://github.com/virtuanalytica/virtualpc.git /opt/virtualpc
cd /opt/virtualpc
cp .env.example .env
```

Edit `.env`:

```bash
PORT=3100
LITELLM_URL=http://127.0.0.1:4000
JWT_SECRET=<long-random-string>
ADMIN_PASSWORD=<strong-password>
```

Run the installer:

```bash
./scripts/install.sh
```

> The install script registers systemd user units. On a system-wide Vultr server you may want to run it as a dedicated `virtualpc` user, or convert the units to system units with `sudo systemctl enable --now ...`.

---

## 4. Configure the firewall

In the Vultr dashboard or via `ufw`:

```bash
ufw default deny incoming
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3100/tcp   # if exposing API directly
ufw enable
```

---

## 5. Nginx reverse proxy + HTTPS

Create `/etc/nginx/sites-available/virtualpc`:

```nginx
server {
    listen 80;
    server_name vpc.example.com;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable:

```bash
ln -s /etc/nginx/sites-available/virtualpc /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

Get a certificate:

```bash
certbot --nginx -d vpc.example.com
```

---

## 6. GPU inference on Vultr (optional)

If you chose a Vultr Cloud GPU instance:

```bash
# Install NVIDIA drivers and the NVIDIA container toolkit
apt install -y linux-headers-$(uname -r)
# Follow Vultr's NVIDIA driver guide for your OS, then:
apt install -y nvidia-container-toolkit
systemctl restart docker
```

Edit `deploy/docker-compose.litellm.yml` to pass the GPU to the LiteLLM container and run local models via Ollama or vLLM:

```yaml
services:
  litellm:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

Then follow `docs/DEPLOY-OLLAMA.md` for model configuration.

---

## 7. Verify

```bash
curl https://vpc.example.com/api/health
curl https://vpc.example.com/health/liveliness
```

Open the dashboard:

```bash
https://vpc.example.com/dashboard.html
```

---

## 8. Maintenance

Update automatically:

```bash
systemctl --user start virtualpc-auto-update.timer
systemctl --user enable virtualpc-auto-update.timer
```

Monitor logs:

```bash
journalctl --user -u virtualpc -f
journalctl --user -u virtualpc-litellm -f
```

---

## Next steps

- Add cloud API keys as fallbacks in `~/.virtualpc/llm-keys.env`.
- Read `docs/DATA-SCIENCE-WIKI.md` to enable DS workloads.
- Read `docs/DEPLOYMENT.md` for the full infrastructure overview.
