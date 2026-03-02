#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# HealOps EC2 User Data — runs once on first boot
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
LOG="/var/log/healops-setup.log"
exec > >(tee -a "$LOG") 2>&1

echo "════════════════════════════════════════════"
echo " HealOps EC2 Bootstrap — $(date)"
echo "════════════════════════════════════════════"

# ── System ────────────────────────────────────────────────────────────────────
apt-get update -y
apt-get upgrade -y
apt-get install -y curl wget git unzip jq ca-certificates gnupg htop net-tools

# ── Docker ────────────────────────────────────────────────────────────────────
echo "▶ Installing Docker..."
curl -fsSL https://get.docker.com | sh
usermod -aG docker ubuntu
systemctl enable docker && systemctl start docker

# ── Docker Compose plugin ─────────────────────────────────────────────────────
apt-get install -y docker-compose-plugin

# ── Node 20 + pnpm (for migrations) ──────────────────────────────────────────
echo "▶ Installing Node 20..."
su - ubuntu -c '
  curl -fsSL https://fnm.vercel.app/install | bash
  export PATH="$HOME/.local/share/fnm:$PATH"
  eval "$(fnm env)"
  fnm install 20 && fnm default 20
  npm install -g pnpm@10.26.0
  echo "export PATH=\"\$HOME/.local/share/fnm:\$PATH\"" >> ~/.bashrc
  echo "eval \"\$(fnm env)\"" >> ~/.bashrc
'

# ── App directory ─────────────────────────────────────────────────────────────
APP_DIR="/home/ubuntu/healops"
mkdir -p "$APP_DIR"/{logs,apm}
chown -R ubuntu:ubuntu "$APP_DIR"

# ── Get public IP using IMDSv2 (token-based) ─────────────────────────────────
IMDS_TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 300")
PUBLIC_IP=$(curl -s -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \
  http://169.254.169.254/latest/meta-data/public-ipv4)

# ── .env — RDS + ElastiCache endpoints injected by Terraform templatefile() ──
cat > "$APP_DIR/.env" << 'ENVEOF'
# ── App ──────────────────────────────────────────────────────────────────────
NODE_ENV=production
PORT=4000
CORS_ORIGINS=*
HEALOPS_PUBLIC_URL=http://PLACEHOLDER_PUBLIC_IP:4000

# ── RDS PostgreSQL (managed AWS — NOT a Docker container) ────────────────────
POSTGRES_HOST=${rds_host}
POSTGRES_PORT=5432
POSTGRES_DB=${rds_db_name}
POSTGRES_USER=${rds_username}
POSTGRES_PASSWORD=${postgres_password}
DATABASE_URL=postgresql://${rds_username}:${postgres_password}@${rds_host}:5432/${rds_db_name}?sslmode=require

# ── ElastiCache Redis (managed AWS — NOT a Docker container) ─────────────────
REDIS_HOST=${redis_host}
REDIS_PORT=6379
REDIS_PASSWORD=${redis_auth_token}
REDIS_TLS_ENABLED=${redis_tls_enabled}

# ── JWT ──────────────────────────────────────────────────────────────────────
JWT_SECRET=${jwt_secret}
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# ── GitHub App ───────────────────────────────────────────────────────────────
GITHUB_APP_ID=${github_app_id}
GITHUB_APP_PRIVATE_KEY="${github_app_private_key}"
GITHUB_WEBHOOK_SECRET=${github_webhook_secret}

# ── OpenRouter ───────────────────────────────────────────────────────────────
OPENROUTER_API_KEY=${openrouter_api_key}
OPENROUTER_MODEL=anthropic/claude-sonnet-4-5
OPENROUTER_MAX_TOKENS=4096
OPENROUTER_TEMPERATURE=0.1
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# ── Slack ────────────────────────────────────────────────────────────────────
SLACK_WEBHOOK_URL=${slack_webhook_url}
SLACK_DEFAULT_CHANNEL=#eng-healops

# ── HealOps ──────────────────────────────────────────────────────────────────
HEALOPS_WEBHOOK_API_KEY=${healops_webhook_api_key}
AGENT_MAX_RETRIES=3
AGENT_MIN_CONFIDENCE=0.55
AGENT_TOKEN_BUDGET_PER_JOB=100000
AGENT_MAX_LOG_SNIPPET_TOKENS=8000
MONTHLY_TOKEN_BUDGET=1000000
MONTHLY_JOB_LIMIT=500
COST_INPUT_PRICE_PER_TOKEN=0.000003
COST_OUTPUT_PRICE_PER_TOKEN=0.000015

# ── AWS ──────────────────────────────────────────────────────────────────────
AWS_REGION=${aws_region}
S3_BUCKET_NAME=${s3_bucket_name}

# ── Observability ────────────────────────────────────────────────────────────
GRAFANA_ADMIN_PASSWORD=${grafana_admin_password}
OTEL_SERVICE_NAME=healops
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318/v1/traces

# ── Docker image tag ─────────────────────────────────────────────────────────
IMAGE_TAG=latest
ENVEOF

# Replace public_ip placeholder
sed -i "s|PLACEHOLDER_PUBLIC_IP|$PUBLIC_IP|g" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"
chown ubuntu:ubuntu "$APP_DIR/.env"

# ── Prometheus config ─────────────────────────────────────────────────────────
cat > "$APP_DIR/apm/prometheus.yml" << 'PROMEOF'
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'healops-api'
    static_configs:
      - targets: ['healops_backend:4000']
    metrics_path: '/metrics'
PROMEOF

chown ubuntu:ubuntu "$APP_DIR/apm/prometheus.yml"

# ── systemd service (auto-restart after EC2 reboot) ──────────────────────────
cat > /etc/systemd/system/healops.service << 'SVCEOF'
[Unit]
Description=HealOps Application
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=ubuntu
WorkingDirectory=/home/ubuntu/healops
ExecStart=/usr/bin/docker compose -f docker-compose-prod.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose-prod.yml down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable healops.service

echo "✅ Bootstrap done — RDS: ${rds_host} | Redis: ${redis_host}"
