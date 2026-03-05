#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# HealOps — OCI Cloud-Init (runs once on first boot)
# ARM (aarch64) Ubuntu 24.04
# Installs: Docker, Node.js 22, pnpm, PM2, Nginx, PostgreSQL, Redis
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
LOG="/var/log/healops-setup.log"
exec > >(tee -a "$LOG") 2>&1

echo "════════════════════════════════════════════"
echo " HealOps OCI Bootstrap — $(date)"
echo " Architecture: $(uname -m)"
echo "════════════════════════════════════════════"

# ── System Packages ─────────────────────────────────────────────────────────
apt-get update -y
apt-get upgrade -y
apt-get install -y curl wget git unzip jq ca-certificates gnupg htop \
  net-tools nginx certbot python3-certbot-nginx

# ── Docker (ARM-compatible) ─────────────────────────────────────────────────
echo "▶ Installing Docker..."
curl -fsSL https://get.docker.com | sh
usermod -aG docker ubuntu
systemctl enable docker && systemctl start docker

# ── Docker Compose Plugin ───────────────────────────────────────────────────
apt-get install -y docker-compose-plugin

# ── Node.js 22 (ARM) ───────────────────────────────────────────────────────
echo "▶ Installing Node.js 22..."
su - ubuntu -c '
  curl -fsSL https://fnm.vercel.app/install | bash
  export PATH="$HOME/.local/share/fnm:$PATH"
  eval "$(fnm env)"
  fnm install 22 && fnm default 22
  npm install -g pnpm@10 pm2
  echo "export PATH=\"\$HOME/.local/share/fnm:\$PATH\"" >> ~/.bashrc
  echo "eval \"\$(fnm env)\"" >> ~/.bashrc
'

# ── SSH Hardening (port 10023, key-only, no root) ─────────────────────────
echo "▶ Hardening SSH..."
sed -i 's/^#\?Port .*/Port 10023/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

# ── OCI Firewall (iptables) ────────────────────────────────────────────────
# OCI Security Lists control network access, but the OS firewall also blocks.
# We must open ports in iptables too (unlike AWS where SG is sufficient).
echo "▶ Opening firewall ports..."
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 10023 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3001 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 4000 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 9090 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 16686 -j ACCEPT

# ── Security: fail2ban + auto-updates ─────────────────────────────────────
apt-get install -y fail2ban unattended-upgrades
cat > /etc/fail2ban/jail.local << 'F2BEOF'
[sshd]
enabled = true
port = 10023
maxretry = 5
bantime = 3600
F2BEOF
systemctl enable fail2ban && systemctl restart fail2ban
dpkg-reconfigure -plow unattended-upgrades || true

# Persist iptables rules across reboots
apt-get install -y iptables-persistent
netfilter-persistent save 2>/dev/null || iptables-save > /etc/iptables/rules.v4

# ── App directory ───────────────────────────────────────────────────────────
APP_DIR="/home/ubuntu/healops"
mkdir -p "$APP_DIR"/{logs,apm,deploy}
chown -R ubuntu:ubuntu "$APP_DIR"

# ── Log directory for PM2 ──────────────────────────────────────────────────
mkdir -p /var/log/healops
chown ubuntu:ubuntu /var/log/healops

# ── Get public IP ───────────────────────────────────────────────────────────
PUBLIC_IP=$(curl -s http://169.254.169.254/opc/v1/instance/metadata/public_ip 2>/dev/null \
  || curl -s http://ifconfig.me)

# ── .env for backend ───────────────────────────────────────────────────────
cat > "$APP_DIR/.env" << 'ENVEOF'
# ── App ──────────────────────────────────────────────────────────────────────
NODE_ENV=production
PORT=4000
CORS_ORIGINS=https://${domain_name},https://www.${domain_name}
FRONTEND_URL=https://${domain_name}
HEALOPS_PUBLIC_URL=https://${domain_name}/api

# ── PostgreSQL (Docker on same instance) ────────────────────────────────────
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=healops
POSTGRES_USER=healops
POSTGRES_PASSWORD=${postgres_password}
DATABASE_URL=postgresql://healops:${postgres_password}@127.0.0.1:5432/healops

# ── Redis (Docker on same instance) ────────────────────────────────────────
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=${redis_password}
REDIS_TLS_ENABLED=false

# ── JWT ────────────────────────────────────────────────────────────────────
JWT_SECRET=${jwt_secret}
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# ── GitHub App ─────────────────────────────────────────────────────────────
GITHUB_APP_ID=${github_app_id}
GITHUB_APP_PRIVATE_KEY="${github_app_private_key}"
GITHUB_WEBHOOK_SECRET=${github_webhook_secret}

# ── OpenRouter (LLM) ──────────────────────────────────────────────────────
OPENROUTER_API_KEY=${openrouter_api_key}
OPENROUTER_MODEL=anthropic/claude-sonnet-4-5
OPENROUTER_MAX_TOKENS=4096
OPENROUTER_TEMPERATURE=0.1
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# ── Slack ──────────────────────────────────────────────────────────────────
SLACK_WEBHOOK_URL=${slack_webhook_url}
SLACK_DEFAULT_CHANNEL=#eng-healops

# ── HealOps Agent ─────────────────────────────────────────────────────────
HEALOPS_WEBHOOK_API_KEY=${healops_webhook_api_key}
AGENT_MAX_RETRIES=3
AGENT_MIN_CONFIDENCE=0.55
AGENT_TOKEN_BUDGET_PER_JOB=100000
AGENT_MAX_LOG_SNIPPET_TOKENS=8000
MONTHLY_TOKEN_BUDGET=1000000
MONTHLY_JOB_LIMIT=500

# ── Observability ──────────────────────────────────────────────────────────
OTEL_SERVICE_NAME=healops
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318/v1/traces
ENVEOF

sed -i "s|PLACEHOLDER_PUBLIC_IP|$PUBLIC_IP|g" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"
chown ubuntu:ubuntu "$APP_DIR/.env"

# ── Docker Compose for infra (PostgreSQL + Redis) ──────────────────────────
cat > "$APP_DIR/deploy/docker-compose.infra.yml" << 'DCEOF'
services:
  postgres:
    image: pgvector/pgvector:pg17
    container_name: healops-postgres
    environment:
      POSTGRES_DB: healops
      POSTGRES_USER: healops
      POSTGRES_PASSWORD: ${postgres_password}
      TZ: UTC
    ports:
      - '127.0.0.1:5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: healops-redis
    ports:
      - '127.0.0.1:6379:6379'
    volumes:
      - redis_data:/data
    restart: unless-stopped
    command: ['redis-server', '--requirepass', '${redis_password}', '--appendonly', 'yes', '--maxmemory', '512mb', '--maxmemory-policy', 'allkeys-lru']

volumes:
  postgres_data:
  redis_data:
DCEOF

chown ubuntu:ubuntu "$APP_DIR/deploy/docker-compose.infra.yml"

# ── Start PostgreSQL + Redis ────────────────────────────────────────────────
echo "▶ Starting PostgreSQL + Redis..."
su - ubuntu -c "cd $APP_DIR && docker compose -f deploy/docker-compose.infra.yml up -d"

# ── Swap (safety net for builds) ───────────────────────────────────────────
if [ ! -f /swapfile ]; then
  echo "▶ Creating 4GB swap..."
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo ""
echo "════════════════════════════════════════════"
echo " ✅ OCI Bootstrap Complete"
echo " Instance IP: $PUBLIC_IP"
echo " Architecture: $(uname -m) (ARM)"
echo " PostgreSQL: 127.0.0.1:5432"
echo " Redis: 127.0.0.1:6379"
echo ""
echo " Next steps (SSH in as ubuntu):"
echo "   1. git clone your repo into ~/healops"
echo "   2. cp .env apps/backend/.env"
echo "   3. cd apps/backend && pnpm install && pnpm build"
echo "   4. pnpm db:migrate && pnpm db:seed"
echo "   5. cd ../frontend && pnpm install && pnpm build"
echo "   6. pm2 start ecosystem.config.js --env production"
echo "════════════════════════════════════════════"
