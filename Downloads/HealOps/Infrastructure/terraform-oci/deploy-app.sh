#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# HealOps — Full App Deployment to OCI Instance
# Runs over SSH: clones repo, builds, starts everything
#
# Usage: ./deploy-app.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
SSH_KEY="../../healops-oci.pem"
SERVER_IP=$(terraform output -raw instance_public_ip 2>/dev/null)
SSH_USER="ubuntu"
REPO_URL="https://github.com/charan-happy/Oopsops.git"
APP_DIR="/home/ubuntu/healops"
BRANCH="main"

if [ -z "$SERVER_IP" ]; then
  echo "ERROR: Could not get instance IP from terraform output"
  exit 1
fi

SSH_CMD="ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i $SSH_KEY $SSH_USER@$SERVER_IP"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  HealOps — Deploying to $SERVER_IP                         "
echo "╚══════════════════════════════════════════════════════════════╝"

# ── Step 0: Wait for cloud-init to finish ─────────────────────────────────────
echo ""
echo "▶ [0/7] Checking SSH connectivity and cloud-init status..."
for i in $(seq 1 30); do
  if $SSH_CMD "cloud-init status 2>/dev/null | grep -qE 'done|error' && echo READY || echo WAITING" 2>/dev/null | grep -q "READY"; then
    echo "  Cloud-init complete! Server is ready."
    break
  fi
  if [ $i -eq 30 ]; then
    echo "  WARNING: Cloud-init may not be finished. Proceeding anyway..."
    break
  fi
  echo "  Waiting for server... ($i/30)"
  sleep 10
done

# ── Step 1: Clone repository ─────────────────────────────────────────────────
echo ""
echo "▶ [1/7] Cloning repository..."
echo "  Syncing code via rsync..."
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
rsync -az --progress \
  --exclude=node_modules --exclude=.git --exclude=dist \
  --exclude=.next --exclude=.terraform --exclude='*.tfstate*' \
  --exclude=terraform.tfvars --exclude='*.pem' --exclude=.env \
  --exclude=.env.local \
  -e "ssh -o StrictHostKeyChecking=no -i $SSH_KEY" \
  "$REPO_ROOT/" "$SSH_USER@$SERVER_IP:/home/ubuntu/healops/"

# ── Step 2: Install dependencies ──────────────────────────────────────────────
echo ""
echo "▶ [2/7] Installing dependencies..."
$SSH_CMD << 'REMOTE_SCRIPT'
set -euo pipefail
export PATH="$HOME/.local/share/fnm:$PATH"
eval "$(fnm env)"

cd ~/healops
pnpm install --frozen-lockfile || pnpm install
REMOTE_SCRIPT

# ── Step 3: Setup env files ───────────────────────────────────────────────────
echo ""
echo "▶ [3/7] Setting up environment files..."
# Use the .env already created by cloud-init, copy to the right places
$SSH_CMD << 'REMOTE_SCRIPT'
set -euo pipefail
cd ~/healops

# Backend env — use the cloud-init generated .env if it exists
if [ -f ~/healops/.env ]; then
  cp ~/healops/.env apps/backend/.env
  echo "  Copied cloud-init .env to apps/backend/.env"
else
  cp deploy/.env.backend.production apps/backend/.env
  echo "  WARNING: Using template .env — update CHANGE_ME values!"
fi

# Frontend env
cp deploy/.env.frontend.production apps/frontend/.env
# Update frontend URL to use IP if no domain yet
PUBLIC_IP=$(curl -s http://ifconfig.me)
sed -i "s|https://healops.online|http://$PUBLIC_IP|g" apps/frontend/.env
echo "  Frontend configured with IP: $PUBLIC_IP"
REMOTE_SCRIPT

# ── Step 4: Start infrastructure (PostgreSQL + Redis) ─────────────────────────
echo ""
echo "▶ [4/7] Starting PostgreSQL + Redis..."
$SSH_CMD << 'REMOTE_SCRIPT'
set -euo pipefail
cd ~/healops

# Stop any existing containers from cloud-init
docker compose -f deploy/docker-compose.infra.yml down 2>/dev/null || true

# Start with proper env
docker compose -f deploy/docker-compose.infra.yml --env-file apps/backend/.env up -d

echo "  Waiting for databases to be healthy..."
sleep 10
docker compose -f deploy/docker-compose.infra.yml ps
REMOTE_SCRIPT

# ── Step 5: Build applications ────────────────────────────────────────────────
echo ""
echo "▶ [5/7] Building backend and frontend (this may take a few minutes)..."
$SSH_CMD << 'REMOTE_SCRIPT'
set -euo pipefail
export PATH="$HOME/.local/share/fnm:$PATH"
eval "$(fnm env)"

cd ~/healops

# Build backend
echo "  Building backend..."
cd apps/backend
pnpm build
echo "  Backend built!"

# Run migrations
echo "  Running database migrations..."
pnpm db:migrate || echo "  WARNING: Migration failed — may need manual fix"

cd ../..

# Build frontend
echo "  Building frontend..."
cd apps/frontend
NODE_OPTIONS='--max-old-space-size=4096' pnpm build
echo "  Frontend built!"
cd ../..
REMOTE_SCRIPT

# ── Step 6: Start application with PM2 ───────────────────────────────────────
echo ""
echo "▶ [6/7] Starting application with PM2..."
$SSH_CMD << 'REMOTE_SCRIPT'
set -euo pipefail
export PATH="$HOME/.local/share/fnm:$PATH"
eval "$(fnm env)"

cd ~/healops

# Stop existing PM2 processes
pm2 delete all 2>/dev/null || true

# Start all services
pm2 start ecosystem.config.js --env production

# Save and setup startup
pm2 save
sudo env PATH=$PATH:$(which node | xargs dirname) $(which pm2) startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null || true

echo ""
pm2 status
REMOTE_SCRIPT

# ── Step 7: Configure Nginx ──────────────────────────────────────────────────
echo ""
echo "▶ [7/7] Configuring Nginx..."
$SSH_CMD << 'REMOTE_SCRIPT'
set -euo pipefail
cd ~/healops

PUBLIC_IP=$(curl -s http://ifconfig.me)

# Create a simpler HTTP-only nginx config (SSL later with domain)
sudo tee /etc/nginx/sites-available/healops > /dev/null << NGINX_EOF
# HealOps — Nginx (HTTP only — add SSL after DNS setup)

upstream frontend {
    server 127.0.0.1:3000;
    keepalive 32;
}

upstream backend {
    server 127.0.0.1:4000;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name $PUBLIC_IP healops.online www.healops.online;

    client_max_body_size 50M;

    # Backend API
    location /api/ {
        rewrite ^/api/(.*) /\$1 break;
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 30s;
        proxy_send_timeout 60s;
        proxy_read_timeout 120s;
    }

    # WebSocket
    location /api/events {
        rewrite ^/api/(.*) /\$1 break;
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s;
    }

    # Health check
    location = /api/health {
        rewrite ^/api/(.*) /\$1 break;
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }

    # GitHub webhooks
    location /api/v1/github-webhook {
        rewrite ^/api/(.*) /\$1 break;
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        client_max_body_size 10M;
    }

    # Frontend (Next.js)
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_set_header Upgrade \$http_upgrade;
    }

    # Static assets cache
    location /_next/static/ {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        expires 365d;
        add_header Cache-Control "public, immutable";
    }
}
NGINX_EOF

# Enable site
sudo ln -sf /etc/nginx/sites-available/healops /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test and reload
sudo nginx -t && sudo systemctl reload nginx
echo "  Nginx configured!"
REMOTE_SCRIPT

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  DEPLOYMENT COMPLETE!"
echo ""
echo "  Server IP:  $SERVER_IP"
echo "  Frontend:   http://$SERVER_IP"
echo "  API:        http://$SERVER_IP/api/health"
echo "  SSH:        ssh -i $SSH_KEY $SSH_USER@$SERVER_IP"
echo ""
echo "  Next steps:"
echo "    1. Point healops.online DNS A record to $SERVER_IP"
echo "    2. SSH in and run: sudo certbot --nginx -d healops.online"
echo "    3. Replace HTTP nginx config with full SSL config"
echo "════════════════════════════════════════════════════════════════"
