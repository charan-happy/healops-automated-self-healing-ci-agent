# HealOps — EC2 Deployment Guide (PM2 + Nginx)

## Architecture

```
                    ┌─────────────────────────────────────────────┐
  Internet          │  EC2 (t3.large — 2 vCPU, 8GB RAM)          │
     │              │                                             │
     ▼              │  ┌──────────────────────────────┐           │
 healops.online     │  │  Nginx (port 80/443)         │           │
     │              │  │  ├── /        → :3000 (Next)  │           │
     ▼              │  │  ├── /api/*   → :4000 (Nest)  │           │
 ┌────────┐         │  │  └── WebSocket → :4000        │           │
 │ Route53│ ───────►│  └──────────────────────────────┘           │
 └────────┘         │                                             │
                    │  ┌──── PM2 ─────────────────────┐           │
                    │  │ healops-frontend  (:3000)     │           │
                    │  │ healops-backend   (:4000)     │           │
                    │  │ healops-worker    (no port)   │           │
                    │  └──────────────────────────────┘           │
                    │                                             │
                    │  ┌──── Docker ───────────────────┐           │
                    │  │ PostgreSQL 17 + pgvector (:5432)│          │
                    │  │ Redis 7              (:6379)   │           │
                    │  └──────────────────────────────┘           │
                    └─────────────────────────────────────────────┘
```

## Instance Type Recommendation

| Instance    | vCPU | RAM  | Cost/month (ap-south-1) | Verdict |
|-------------|------|------|------------------------|---------|
| t3.medium   | 2    | 4GB  | ~$30                   | Tight. Works for demo, may OOM during build |
| **t3.large** | **2** | **8GB** | **~$60** | **Recommended. Comfortable for all services** |
| t3.xlarge   | 4    | 16GB | ~$120                  | Overkill unless heavy traffic |

**Go with t3.large** — PostgreSQL needs ~1GB, Redis ~256MB, Backend ~512MB, Worker ~512MB, Frontend ~512MB, Nginx ~64MB, OS ~1GB. Total ~3.8GB, leaving headroom for builds and spikes.

If budget is very tight, t3.medium works if you build on your local machine and deploy pre-built artifacts.

## Step 1: Launch EC2

```bash
# AMI: Ubuntu 24.04 LTS (arm64 for cost savings, or amd64)
# Instance: t3.large
# Storage: 30GB gp3 (minimum)
# Security Group:
#   - SSH (22) from your IP
#   - HTTP (80) from anywhere
#   - HTTPS (443) from anywhere
```

## Step 2: Server Setup

```bash
# SSH into your instance
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 22 via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
nvm alias default 22

# Install pnpm
npm install -g pnpm@10

# Install PM2
npm install -g pm2

# Install Docker + Docker Compose
sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker ubuntu
newgrp docker

# Install Nginx
sudo apt install -y nginx

# Install Certbot for SSL
sudo apt install -y certbot python3-certbot-nginx

# Create log directory
sudo mkdir -p /var/log/healops
sudo chown ubuntu:ubuntu /var/log/healops
```

## Step 3: Clone & Build

```bash
# Clone repository
cd /home/ubuntu
git clone https://github.com/your-org/healops-development.git healops
cd healops

# Install dependencies
pnpm install

# ─── Copy env files ─────────────────────────────────────────────────────────
# Edit deploy/.env.backend.production — replace all CHANGE_ME values
# Then copy to backend:
cp deploy/.env.backend.production apps/backend/.env

# Copy frontend env:
cp deploy/.env.frontend.production apps/frontend/.env

# ─── Build Backend ───────────────────────────────────────────────────────────
cd apps/backend
pnpm build
cd ../..

# ─── Build Frontend ──────────────────────────────────────────────────────────
cd apps/frontend
NODE_OPTIONS='--max-old-space-size=2048' pnpm build
cd ../..
```

## Step 4: Start Infrastructure (PostgreSQL + Redis)

```bash
# Start PostgreSQL and Redis via Docker
docker compose -f deploy/docker-compose.infra.yml --env-file apps/backend/.env up -d

# Wait for healthy status
docker compose -f deploy/docker-compose.infra.yml ps

# Run database migrations
cd apps/backend
pnpm db:migrate

# Seed initial data (roles, admin user)
pnpm db:seed
cd ../..
```

## Step 5: Start Application with PM2

```bash
# Start all 3 processes
pm2 start ecosystem.config.js --env production

# Verify all running
pm2 status

# Expected output:
# ┌─────────────────┬───┬─────────┬──────┬────────┐
# │ name            │id │ mode    │ cpu  │ memory │
# ├─────────────────┼───┼─────────┼──────┼────────┤
# │ healops-frontend│ 0 │ fork    │ 0%   │ 120MB  │
# │ healops-backend │ 1 │ fork    │ 0%   │ 250MB  │
# │ healops-worker  │ 2 │ fork    │ 0%   │ 150MB  │
# └─────────────────┴───┴─────────┴──────┴────────┘

# Save PM2 process list (survives reboot)
pm2 save

# Setup PM2 startup script (auto-start on reboot)
pm2 startup
# Copy and run the command it prints
```

## Step 6: Configure Nginx + SSL

```bash
# Copy nginx config
sudo cp deploy/nginx.conf /etc/nginx/sites-available/healops.online

# Enable site
sudo ln -sf /etc/nginx/sites-available/healops.online /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test config (will fail on SSL cert, that's OK)
sudo nginx -t

# ─── First: get SSL cert (temporarily comment out SSL server block) ─────────
# Edit /etc/nginx/sites-available/healops.online
# Comment out the entire "listen 443" server block temporarily
# Keep only the port 80 block with certbot location
sudo nginx -t && sudo systemctl reload nginx

# Get SSL certificate
sudo certbot --nginx -d healops.online -d www.healops.online

# OR if using certbot standalone:
sudo certbot certonly --webroot -w /var/www/certbot -d healops.online -d www.healops.online

# Restore the full nginx config
sudo cp deploy/nginx.conf /etc/nginx/sites-available/healops.online
sudo nginx -t && sudo systemctl reload nginx

# Auto-renewal cron (certbot installs this automatically)
sudo certbot renew --dry-run
```

## Step 7: DNS Configuration (Route53)

```
healops.online    A     → <EC2_ELASTIC_IP>
www.healops.online CNAME → healops.online
```

## Step 8: Verify

```bash
# Health check
curl https://healops.online/api/health

# Frontend
curl -I https://healops.online

# API
curl https://healops.online/api/v1/auth/providers
```

## PM2 Useful Commands

```bash
pm2 status                    # Process status
pm2 logs                      # All logs (live)
pm2 logs healops-backend      # Backend logs only
pm2 restart all               # Restart all
pm2 restart healops-backend   # Restart one
pm2 reload all                # Zero-downtime reload
pm2 monit                     # Real-time monitoring dashboard
pm2 flush                     # Clear all logs
```

## Updating (Deploy new code)

```bash
cd /home/ubuntu/healops
git pull origin main

# Rebuild
cd apps/backend && pnpm build && cd ../..
cd apps/frontend && NODE_OPTIONS='--max-old-space-size=2048' pnpm build && cd ../..

# Reload (zero downtime)
pm2 reload all
```

## Monthly Cost Estimate (ap-south-1 Mumbai)

| Resource | Cost/month |
|----------|-----------|
| t3.large EC2 (on-demand) | ~$60 |
| 30GB gp3 EBS | ~$2.50 |
| Elastic IP | Free (if attached) |
| Route53 hosted zone | $0.50 |
| Data transfer (50GB) | ~$4.50 |
| **Total** | **~$68/month** |

With 1-year Reserved Instance: **~$38/month**
With Spot Instance (non-production): **~$20/month**
