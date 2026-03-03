# HealOps — Complete Setup Guide

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Deployment Options](#deployment-options)
  - [Option A: Oracle Cloud (FREE)](#option-a-oracle-cloud-free-tier--0month)
  - [Option B: AWS EC2](#option-b-aws-ec2--60month)
  - [Option C: Hetzner / DigitalOcean (Budget)](#option-c-budget-vps-hetzner--digitalocean)
- [Post-Deployment](#post-deployment)
- [Monitoring & Observability](#monitoring--observability)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
                    ┌──────────────────────────────────────────────────┐
  Internet          │  Server (OCI Free / AWS EC2 / VPS)              │
     │              │                                                  │
     ▼              │  ┌────────────────────────────────┐             │
 healops.online     │  │  Nginx (80/443)                │             │
     │              │  │  ├── /         → Next.js :3000  │             │
     ▼              │  │  ├── /api/*    → NestJS  :4000  │             │
 ┌────────┐         │  │  └── /api/events → WS    :4000  │             │
 │  DNS   │────────►│  └────────────────────────────────┘             │
 └────────┘         │                                                  │
                    │  ┌──── PM2 ──────────────────────┐              │
                    │  │ healops-frontend  (:3000)      │              │
                    │  │ healops-backend   (:4000)      │              │
                    │  │ healops-worker    (queue)      │              │
                    │  └───────────────────────────────┘              │
                    │                                                  │
                    │  ┌──── Docker ────────────────────┐              │
                    │  │ PostgreSQL 17 + pgvector (:5432)│             │
                    │  │ Redis 7                 (:6379) │             │
                    │  └───────────────────────────────┘              │
                    └──────────────────────────────────────────────────┘
```

**Three PM2 processes:**
| Process | Port | Purpose |
|---------|------|---------|
| `healops-frontend` | 3000 | Next.js 15 (React UI) |
| `healops-backend` | 4000 | NestJS 11 (REST API + WebSocket) |
| `healops-worker` | — | BullMQ queue processor (repair jobs) |

**Two Docker containers:**
| Container | Port | Purpose |
|-----------|------|---------|
| `healops-postgres` | 5432 | PostgreSQL 17 with pgvector |
| `healops-redis` | 6379 | Redis 7 (cache + BullMQ) |

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 22.x | `nvm install 22` |
| pnpm | 10.x | `npm install -g pnpm@10` |
| Docker | 24+ | `curl -fsSL https://get.docker.com \| sh` |
| Terraform | 1.6+ | [terraform.io/downloads](https://developer.hashicorp.com/terraform/downloads) |
| Git | 2.x | pre-installed on most systems |

For **Oracle Cloud** you also need:
- [OCI CLI](https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/cliinstall.htm) (optional but helpful)
- OCI API key pair (`~/.oci/oci_api_key.pem`)

For **AWS** you also need:
- AWS CLI v2 configured with credentials
- An AWS account with billing enabled

---

## Local Development Setup

```bash
# 1. Clone
git clone https://github.com/your-org/healops-development.git
cd healops-development

# 2. Install all dependencies (pnpm workspace)
pnpm install

# 3. Start infrastructure (PostgreSQL + Redis)
docker compose up -d
# This uses the root docker-compose.yml

# 4. Setup backend
cd apps/backend
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL, REDIS_PASSWORD, JWT_SECRET
pnpm db:migrate
pnpm db:seed
cd ../..

# 5. Setup frontend
cd apps/frontend
echo 'NEXT_PUBLIC_BACKEND_URL=http://localhost:4000' > .env.local
cd ../..

# 6. Start everything
pnpm dev
# Frontend: http://localhost:3000
# Backend:  http://localhost:4000
# Swagger:  http://localhost:4000/api/v1
```

---

## Deployment Options

### Cost Comparison

| Provider | Specs | Monthly Cost | Notes |
|----------|-------|-------------|-------|
| **Oracle Cloud Free** | 4 OCPU, 24GB RAM, ARM | **$0** | Best value. Always Free tier |
| AWS EC2 (t3.large) | 2 vCPU, 8GB RAM | ~$60 | + RDS/ElastiCache adds $50+ |
| AWS EC2 (t3.medium) | 2 vCPU, 4GB RAM | ~$30 | Tight, build locally |
| Hetzner CX32 | 3 vCPU, 8GB RAM | ~$7.50 | Great perf/$ ratio |
| DigitalOcean | 2 vCPU, 4GB RAM | ~$24 | Simple, good docs |
| Railway | Shared | ~$5-20 | Git-push deploy |

---

### Option A: Oracle Cloud Free Tier ($0/month)

**What you get FREE forever:**
- **4 OCPU + 24 GB RAM** (ARM Ampere A1.Flex) — more powerful than t3.xlarge
- **200 GB** block storage
- **10 TB/month** outbound bandwidth
- **1 reserved public IP**

> **Important:** OCI Free Tier uses ARM (aarch64). All Docker images we use
> (PostgreSQL, Redis, Node.js, Nginx) support ARM natively.

#### Step 1: Create OCI Account

1. Go to [cloud.oracle.com](https://cloud.oracle.com) → **Sign Up**
2. Use a valid credit card (won't be charged — free tier is truly free)
3. Select **Home Region** → `ap-mumbai-1` (India) or closest to you
4. Wait for account activation (usually 5-30 minutes)

#### Step 2: Generate API Key

```bash
# Create OCI config directory
mkdir -p ~/.oci

# Generate API key pair
openssl genrsa -out ~/.oci/oci_api_key.pem 2048
chmod 600 ~/.oci/oci_api_key.pem
openssl rsa -pubout -in ~/.oci/oci_api_key.pem -out ~/.oci/oci_api_key_public.pem

# Upload public key to OCI:
# OCI Console → Profile → User Settings → API Keys → Add API Key
# Paste contents of ~/.oci/oci_api_key_public.pem
# Note down the fingerprint shown after upload
```

#### Step 3: Get Your OCIDs

Find these in OCI Console:
```
Tenancy OCID:     Profile → Tenancy → copy OCID
User OCID:        Profile → User Settings → copy OCID
Compartment OCID: Use tenancy OCID (for root compartment)
Fingerprint:      Shown when you uploaded the API key
```

#### Step 4: Provision with Terraform

```bash
cd Infrastructure/terraform-oci

# Copy and fill in variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — fill in ALL values

# Initialize Terraform
terraform init

# Preview what will be created
terraform plan

# Create infrastructure
terraform apply
# Type 'yes' when prompted

# Note the outputs — especially ssh_command and instance_public_ip
```

**Expected output:**
```
instance_public_ip = "129.xxx.xxx.xxx"
ssh_command = "ssh -i healops-oci.pem ubuntu@129.xxx.xxx.xxx"
instance_shape_info = {
  arch      = "ARM (aarch64)"
  cost      = "FREE (Always Free Tier)"
  memory_gb = 24
  ocpus     = 4
  shape     = "VM.Standard.A1.Flex"
}
```

#### Step 5: Deploy Application

```bash
# SSH into instance
ssh -i healops-oci.pem ubuntu@<INSTANCE_IP>

# Cloud-init already installed Docker, Node.js, PM2, Nginx
# and started PostgreSQL + Redis. Verify:
docker ps
# Should show healops-postgres and healops-redis

# Clone your repo
cd ~
git clone https://github.com/your-org/healops-development.git healops-app
cd healops-app

# Copy the .env that cloud-init created
cp ~/healops/.env apps/backend/.env

# Create frontend .env
cat > apps/frontend/.env << 'EOF'
NODE_ENV=production
NEXT_PUBLIC_BACKEND_URL=https://healops.online/api
NEXT_PUBLIC_APP_URL=https://healops.online
NEXT_PUBLIC_APP_TITLE=HealOps
NEXT_PUBLIC_APP_NAME=HealOps
EOF

# Install dependencies
pnpm install

# Build backend
cd apps/backend
pnpm build
pnpm db:migrate
pnpm db:seed
cd ../..

# Build frontend (24GB RAM — no issues here!)
cd apps/frontend
NODE_OPTIONS='--max-old-space-size=4096' pnpm build
cd ../..

# Start with PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
# Run the command it prints (sudo env PATH=...)
```

#### Step 6: Configure Nginx + SSL

```bash
# Copy nginx config
sudo cp deploy/nginx.conf /etc/nginx/sites-available/healops.online
sudo ln -sf /etc/nginx/sites-available/healops.online /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# First pass — get SSL cert (temporarily HTTP-only)
# Edit nginx config — comment out the 443 server block
sudo nginx -t && sudo systemctl reload nginx

# Get Let's Encrypt certificate
sudo certbot --nginx -d healops.online -d www.healops.online

# Restore full config with SSL
sudo cp deploy/nginx.conf /etc/nginx/sites-available/healops.online
sudo nginx -t && sudo systemctl reload nginx
```

#### Step 7: DNS

Point your domain to the OCI instance IP:
```
healops.online      A    → <INSTANCE_IP>
www.healops.online  CNAME → healops.online
```

You can use any DNS provider (Namecheap, Cloudflare, Route53, etc.)

#### OCI-Specific Gotchas

| Issue | Solution |
|-------|----------|
| **"Out of capacity" error** | A1.Flex is popular. Try different Availability Domain, or retry later. Some people script it to retry every 60s. |
| **Can't SSH after creation** | OCI has OS-level iptables. Cloud-init opens ports, but if it failed, run: `sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 22 -j ACCEPT` via OCI Console serial connection. |
| **ARM Docker images** | Ensure images support `linux/arm64`. All official images do. Check with `docker manifest inspect <image>`. |
| **Instance stuck "provisioning"** | Normal for A1.Flex — can take 5-10 minutes. Be patient. |
| **Account deactivated** | OCI may deactivate after 60 days of inactivity. Keep instance running or SSH in occasionally. |

---

### Option B: AWS EC2 (~$60/month)

Uses managed services (RDS PostgreSQL + ElastiCache Redis) for production reliability.

#### Step 1: Bootstrap Terraform State

```bash
cd Infrastructure/scripts
chmod +x bootstrap.sh
./bootstrap.sh
# Creates S3 bucket + DynamoDB table for state locking
```

#### Step 2: Provision

```bash
cd Infrastructure/terraform

# Copy and fill variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars

terraform init
terraform plan
terraform apply
```

#### Step 3: Deploy

The user-data script auto-configures the EC2 instance. After `terraform apply`:

```bash
# Get SSH command from output
terraform output ssh_command

# SSH in
ssh -i healops-ec2.pem ubuntu@<EC2_IP>

# Clone and deploy
cd ~
git clone https://github.com/your-org/healops-development.git healops-app
cd healops-app

# .env was created by user-data — copy it
cp ~/healops/.env apps/backend/.env

# Build + start (same as OCI steps above)
pnpm install
cd apps/backend && pnpm build && pnpm db:migrate && pnpm db:seed && cd ../..
cd apps/frontend && NODE_OPTIONS='--max-old-space-size=2048' pnpm build && cd ../..
pm2 start ecosystem.config.js --env production
pm2 save && pm2 startup
```

#### AWS Cost Breakdown (ap-south-1)

| Resource | Monthly |
|----------|---------|
| EC2 t3.large (on-demand) | ~$60 |
| RDS db.t3.medium (single-AZ) | ~$35 |
| ElastiCache cache.t4g.micro | ~$12 |
| EBS 30GB gp3 | ~$2.50 |
| Elastic IP | Free |
| Data transfer (50GB) | ~$4.50 |
| **Total** | **~$114/month** |

To reduce: use EC2 + Docker for PostgreSQL/Redis (skip RDS/ElastiCache) = **~$68/month**

---

### Option C: Budget VPS (Hetzner / DigitalOcean)

Same PM2 + Docker setup — just on a cheaper VPS.

#### Hetzner ($7.50/month — Best Value)

```bash
# 1. Create server at hetzner.com/cloud
#    - Location: Ashburn or Nuremberg
#    - Image: Ubuntu 24.04
#    - Type: CX32 (3 vCPU, 8GB RAM, 80GB)
#    - Add your SSH key

# 2. SSH in
ssh root@<SERVER_IP>

# 3. Create deploy user
adduser ubuntu
usermod -aG sudo ubuntu
cp -r ~/.ssh /home/ubuntu/.ssh
chown -R ubuntu:ubuntu /home/ubuntu/.ssh

# 4. Switch to deploy user
su - ubuntu

# 5. Run setup script
git clone https://github.com/your-org/healops-development.git ~/healops
cd ~/healops
chmod +x deploy/setup.sh
./deploy/setup.sh

# 6. Follow same build + PM2 steps as above
```

#### DigitalOcean ($24/month)

```bash
# Create Droplet:
#   - Image: Ubuntu 24.04
#   - Plan: Regular, $24/month (2 vCPU, 4GB RAM)
#   - Add SSH key

# Same deploy steps as Hetzner
```

---

## Post-Deployment

### Verify Everything Works

```bash
# Health check
curl https://healops.online/api/health

# Frontend loads
curl -I https://healops.online

# API responds
curl https://healops.online/api/v1/auth/providers

# WebSocket connects (test in browser console)
# new WebSocket('wss://healops.online/api/events')
```

### PM2 Commands

```bash
pm2 status                    # All process status
pm2 logs                      # Live logs (all)
pm2 logs healops-backend      # Backend logs only
pm2 restart all               # Restart all
pm2 reload all                # Zero-downtime reload
pm2 monit                     # Real-time dashboard
pm2 flush                     # Clear all logs
```

### Deploy Updates

```bash
cd ~/healops-app
git pull origin main

# Rebuild
cd apps/backend && pnpm build && cd ../..
cd apps/frontend && pnpm build && cd ../..

# Reload (zero downtime)
pm2 reload all
```

### SSL Certificate Renewal

Let's Encrypt certs expire every 90 days. Certbot auto-renews via cron. Verify:
```bash
sudo certbot renew --dry-run
```

---

## Monitoring & Observability

After deployment, optionally start the monitoring stack:

```bash
# Start observability services
docker compose -f docker-compose.yml up -d prometheus grafana jaeger loki promtail

# Access:
# Grafana:    https://healops.online:3001 (admin/admin)
# Prometheus: https://healops.online:9090
# Jaeger:     https://healops.online:16686
```

**Pre-built Grafana Dashboards:**
- `HealOps — API Performance` (request rates, latency, errors)
- `HealOps — Node.js Runtime` (heap, event loop, GC, CPU)
- `HealOps — Application Logs` (Loki log aggregation)
- `HealOps — Repair Agent` (pipeline healing metrics)

---

## Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| `pnpm: command not found` | `export PATH="$HOME/.local/share/fnm:$PATH" && eval "$(fnm env)"` |
| Frontend build OOM | Increase Node memory: `NODE_OPTIONS='--max-old-space-size=4096' pnpm build` |
| Backend can't connect to DB | Check: `docker ps` (postgres running?), `docker logs healops-postgres` |
| Redis connection refused | Check: `docker ps` (redis running?), verify REDIS_PASSWORD matches |
| Nginx 502 Bad Gateway | PM2 process crashed: `pm2 logs`, fix error, `pm2 restart all` |
| SSL cert not working | `sudo certbot --nginx -d healops.online`, ensure DNS A record points to server |
| OCI: "Out of capacity" | A1.Flex demand is high. Try another AD or retry with a script |
| OCI: Can't reach ports | Run `sudo iptables -L -n` — OS firewall may be blocking. See [OCI gotchas](#oci-specific-gotchas) |
| AWS: user-data didn't run | Check: `cat /var/log/cloud-init-output.log` |

### Checking Logs

```bash
# PM2 application logs
pm2 logs healops-backend --lines 100

# System logs
sudo journalctl -u nginx -f

# Docker container logs
docker logs healops-postgres --tail 50
docker logs healops-redis --tail 50

# Cloud-init log (first boot)
cat /var/log/healops-setup.log
```

### Database Operations

```bash
cd apps/backend

# Run migrations
pnpm db:migrate

# Open Drizzle Studio (DB GUI)
pnpm db:studio

# Connect to PostgreSQL directly
docker exec -it healops-postgres psql -U healops -d healops

# Check pgvector extension
docker exec -it healops-postgres psql -U healops -d healops -c "SELECT extname FROM pg_extension;"
```

---

## File Reference

```
Infrastructure/
├── terraform/              # AWS Terraform (EC2 + RDS + ElastiCache)
│   ├── main.tf
│   ├── variables.tf
│   ├── ec2.tf
│   ├── vpc.tf
│   ├── security-group.tf
│   ├── rds.tf
│   ├── elasticcache.tf
│   ├── cloudwatch.tf
│   ├── s3.tf
│   ├── outputs.tf
│   └── terraform.tfvars.example
│
├── terraform-oci/          # Oracle Cloud Terraform (Free Tier)
│   ├── main.tf
│   ├── variables.tf
│   ├── vcn.tf
│   ├── security-list.tf
│   ├── compute.tf
│   ├── outputs.tf
│   └── terraform.tfvars.example
│
├── scripts/                # AWS user-data scripts
│   ├── bootstrap.sh
│   ├── deploy.sh
│   ├── user-data.sh
│   └── enable-pgvector.sh
│
└── scripts-oci/            # OCI cloud-init scripts
    └── cloud-init.sh

deploy/
├── nginx.conf              # Nginx reverse proxy config
├── docker-compose.infra.yml # PostgreSQL + Redis
├── .env.backend.production  # Backend env template
├── .env.frontend.production # Frontend env template
├── setup.sh                # Server setup automation
└── DEPLOY.md               # Detailed EC2 deployment guide

ecosystem.config.js         # PM2 process manager config
SETUP.md                    # This file
```
