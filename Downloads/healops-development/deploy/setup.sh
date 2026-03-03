#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# HealOps — EC2 Server Setup Script (Ubuntu 24.04)
# Run as: chmod +x deploy/setup.sh && ./deploy/setup.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

echo "═══════════════════════════════════════════════════════"
echo "  HealOps — Server Setup"
echo "═══════════════════════════════════════════════════════"

# ─── System Update ────────────────────────────────────────────────────────────
echo "→ Updating system packages..."
sudo apt update && sudo apt upgrade -y

# ─── Node.js 22 via nvm ──────────────────────────────────────────────────────
echo "→ Installing Node.js 22..."
if [ ! -d "$HOME/.nvm" ]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install 22
nvm use 22
nvm alias default 22

# ─── pnpm ────────────────────────────────────────────────────────────────────
echo "→ Installing pnpm..."
npm install -g pnpm@10

# ─── PM2 ─────────────────────────────────────────────────────────────────────
echo "→ Installing PM2..."
npm install -g pm2

# ─── Docker ──────────────────────────────────────────────────────────────────
echo "→ Installing Docker..."
if ! command -v docker &> /dev/null; then
  sudo apt install -y docker.io docker-compose-v2
  sudo usermod -aG docker "$USER"
  echo "⚠  Docker group added. Log out and back in, or run: newgrp docker"
fi

# ─── Nginx ───────────────────────────────────────────────────────────────────
echo "→ Installing Nginx..."
sudo apt install -y nginx

# ─── Certbot (Let's Encrypt) ─────────────────────────────────────────────────
echo "→ Installing Certbot..."
sudo apt install -y certbot python3-certbot-nginx

# ─── Log Directory ───────────────────────────────────────────────────────────
echo "→ Creating log directory..."
sudo mkdir -p /var/log/healops
sudo chown "$USER":"$USER" /var/log/healops

# ─── Certbot webroot ─────────────────────────────────────────────────────────
sudo mkdir -p /var/www/certbot

# ─── Swap (for t3.medium — helps prevent OOM during build) ───────────────────
if [ ! -f /swapfile ]; then
  echo "→ Creating 2GB swap..."
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

# ─── Firewall ────────────────────────────────────────────────────────────────
echo "→ Configuring firewall..."
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw --force enable

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Setup complete! Next steps:"
echo "  1. Clone your repo"
echo "  2. Copy .env files from deploy/"
echo "  3. Run: docker compose -f deploy/docker-compose.infra.yml up -d"
echo "  4. Run: cd apps/backend && pnpm build && pnpm db:migrate && pnpm db:seed"
echo "  5. Run: cd apps/frontend && pnpm build"
echo "  6. Run: pm2 start ecosystem.config.js --env production"
echo "  7. Configure Nginx + SSL"
echo "═══════════════════════════════════════════════════════"
