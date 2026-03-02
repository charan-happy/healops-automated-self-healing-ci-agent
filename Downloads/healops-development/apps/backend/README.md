# NestJS Enterprise Boilerplate

A **production-grade** NestJS 11 application template designed for **humans and AI agents**. Pre-configured with authentication, common enterprise modules, AI integration, observability stack, and background workers.

---

## Prerequisites

- **Node.js**: `>=20.0.0`
- **pnpm**: `>=8.0.0`
- **Docker Engine**: Docker Desktop / Podman / Rancher Desktop / OrbStack

```bash
docker ps  # Verify Docker is running
```

---

## Quick Start

```bash
pnpm install               # Install dependencies
pnpm run setup             # Copy .env.example → .env (one-time)
pnpm local:up              # Start everything (Docker + DB migrate + dev server)
```

### Step-by-step startup

```bash
pnpm generate:prometheus   # Generate Prometheus config
pnpm db:dev:up             # Start Docker containers (Postgres, Redis, monitoring)
sleep 5                    # Wait for DB availability
pnpm db:migrate            # Apply Drizzle SQL migrations
pnpm start:dev             # Start API + Worker in dev mode
```

### Accessible Endpoints

| Service | URL |
|---------|-----|
| App | http://localhost:3000 |
| Swagger API Docs (v1) | http://localhost:3000/api/v1 |
| Swagger API Docs (v2) | http://localhost:3000/api/v2 |
| Health Check | http://localhost:3000/health |
| Health UI | http://localhost:3000/health/health-ui |
| Dev Tools | http://localhost:3000/dev-tools |
| Bull Board (Queues) | http://localhost:3000/admin/queues |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 (admin/admin) |
| Jaeger | http://localhost:16686 |
| Loki | http://localhost:3100 |

---

## Architecture

### Tech Stack

- **NestJS 11** with strict TypeScript
- **Drizzle ORM** (SQL-first workflow) + PostgreSQL
- **Redis** (caching + BullMQ job queues)
- **OpenTelemetry + Jaeger** (distributed tracing)
- **Prometheus + Grafana** (metrics & dashboards)
- **Winston + Loki** (structured logging)

### Design Patterns

- **Repository Pattern** — All DB access isolated in repository classes
- **Strategy/Provider Pattern** — Swappable implementations (S3/Cloudinary, SMTP/SES, Twilio/SNS, Claude/OpenAI)
- **Facade Pattern** — Services orchestrate repositories + providers
- **Factory Pattern** — Provider selection via environment config

### Directory Layout

```
src/
├── auth/               # JWT + OAuth + API Keys + MFA + RBAC
├── users/              # User management with roles
├── media/              # File uploads (S3/Cloudinary)
├── email/              # Templated emails (SMTP/SES)
├── sms/                # SMS + OTP (Twilio/SNS)
├── notifications/      # Multi-channel notifications (FCM/in-app)
├── webhooks/           # Outbound webhooks with HMAC signatures
├── ai/                 # AI service layer + RAG + Agents
│   ├── providers/      #   Claude & OpenAI providers
│   ├── rag/            #   pgvector RAG pipeline
│   └── agents/         #   Agent framework with tools
├── gateway/            # WebSocket gateway (Socket.IO)
├── api/                # Infrastructure APIs
│   ├── health/         #   Health checks (DB, Redis, memory)
│   ├── metrics/        #   Prometheus metrics
│   ├── tracing/        #   OpenTelemetry tracing
│   └── dev-tools/      #   Developer tools dashboard
├── background/         # BullMQ queues & workers
├── common/             # Shared utilities, guards, filters, decorators
│   ├── audit/          #   Application-level audit logging
│   └── export/         #   CSV/PDF/Excel data export
├── config/             # Environment configuration
├── db/                 # Drizzle ORM + centralized repositories
│   ├── drizzle/        #   Schema, migrations, migrate runner
│   ├── repositories/   #   ALL repositories (auth/, users/, media/, etc.)
│   └── seeds/          #   Raw SQL seed files
├── redis/              # Redis client & health
├── otel/               # OpenTelemetry setup
├── logger/             # Winston logging
├── interceptors/       # Global interceptors
├── middlewares/         # Express middlewares
├── app.module.ts       # Main application module
├── main.ts             # API entry point
├── worker.main.ts      # Worker entry point
└── worker.module.ts    # Worker module
```

### Module Structure Convention

Every domain module follows this pattern:

```
src/<module>/                         # Business logic module
├── <module>.module.ts
├── <module>.controller.ts
├── <module>.service.ts               # Business logic (Facade)
├── providers/                        # Swappable implementations
│   ├── <abstract>.provider.ts
│   └── <impl>.provider.ts
├── dto/
├── interfaces/
└── guards/ or decorators/

src/db/repositories/<module>/         # Data access (centralized)
└── <module>.repository.ts            # Drizzle queries ONLY
```

**Important**: Repositories live under `src/db/repositories/`, NOT inside domain modules. The global `DBModule` exports all repositories, so any module can inject any repository without cross-module coupling.

See `docs/conventions/` for detailed patterns.

---

## Scripts

### Development

```bash
pnpm start:dev          # Start API + Worker (watch mode)
pnpm start:prod         # Production mode
pnpm build              # Compile API + Worker
pnpm type-check         # TypeScript strict mode check
```

### Database (Drizzle + PostgreSQL)

```bash
pnpm db:migrate              # Apply SQL migrations
pnpm db:seed                 # Run raw SQL seed files (roles, admin user)
pnpm db:introspect           # Generate Drizzle schema from DB
pnpm db:generate             # migrate + introspect (combined)
pnpm db:create-migration <n> # Create new empty SQL migration
pnpm db:studio               # Open Drizzle Studio
```

### Code Quality

```bash
pnpm lint               # ESLint fix
pnpm lint:check         # ESLint check only
pnpm format             # Prettier format
pnpm pre-commit         # type-check + lint + test
```

### Testing

```bash
pnpm test                       # Jest unit tests
pnpm test:e2e                   # Playwright E2E tests
pnpm test:coverage              # Coverage report
pnpm test:playwright:unit       # Playwright unit
pnpm test:playwright:functional # Playwright functional
pnpm test:playwright:e2e        # Playwright E2E
pnpm test:playwright:ui         # Interactive Playwright UI
pnpm test:artillery:quick       # Quick load test
pnpm test:artillery:stress      # Stress test
```

### Docker & Infra

```bash
pnpm db:dev:up           # Start all Docker containers
pnpm db:dev:rm           # Stop & remove containers
pnpm generate:prometheus # Generate Prometheus config
docker build -t app .    # Build production Docker image
```

---

## Auth System

Full enterprise authentication:

- **JWT** — Access + refresh tokens with rotation
- **OAuth** — Google, GitHub (Apple stub ready)
- **API Keys** — Prefix-based lookup with hash validation
- **MFA** — TOTP with QR code + backup codes
- **RBAC** — Roles (OR logic) + Permissions (AND logic)

### Guards (applied globally in order)

1. `ThrottlerGuard` — Rate limiting
2. `JwtAuthGuard` — JWT validation (skip with `@Public()`)
3. `RolesGuard` — Role check (use `@Roles('admin')`)
4. `PermissionsGuard` — Permission check (use `@Permissions('users:read')`)

### Default Roles

| Role | Permissions |
|------|------------|
| admin | All permissions |
| moderator | users:read/write, media:read/write, ai:read/write, notifications:read/write, webhooks:read/write |
| user | users:read, media:read, ai:read, notifications:read, webhooks:read |

---

## Webhooks

Outbound webhook system with HMAC-SHA256 signed payloads:

- **CRUD** — Create, list, update, delete webhook subscriptions
- **Event-based dispatch** — Subscribe webhooks to specific events
- **Reliable delivery** — BullMQ queue with 5 retries and exponential backoff
- **Signature verification** — HMAC-SHA256 signatures (`X-Webhook-Signature` header)
- **Delivery tracking** — Full delivery history with response status and retry info
- **Test events** — Send test payloads to verify endpoints

---

## Data Export

Reusable export service (`ExportModule`) for any domain module:

- **CSV** — RFC 4180 compliant, configurable delimiters, UTF-8 BOM for Excel
- **PDF** — Table-based reports with headers, pagination, page numbers (pdfkit)
- **Excel** — Styled worksheets with auto-width columns, filters (exceljs)

---

## Real-time Communication

WebSocket gateway via Socket.IO:

- Room-based user targeting for notifications and events
- Auto join/leave on connect/disconnect
- Extensible event handlers

---

## Audit Logging

Application-level audit logging with decorator support:

- `@AuditLog('action', 'SEVERITY')` decorator on controller methods
- Automatic capture of user, IP, user-agent, request details
- Stored in `audit_logs` table for compliance and traceability

---

## AI Integration

### Service Layer
Provider-agnostic AI interface supporting Claude and OpenAI:
- Chat completions with streaming
- Embeddings generation
- Structured output (JSON mode)
- Token counting and cost tracking

### RAG Pipeline (pgvector)
- Document ingestion with multiple chunking strategies (fixed, recursive, paragraph)
- Embedding generation via AI providers
- Semantic similarity search with metadata filtering
- Hybrid retrieval (vector + keyword)

### Agent Framework
- Multi-turn conversations with tool calling loop
- Built-in tools: RAG search, database queries (read-only), external API calls
- Conversation memory (sliding window + summarization)
- Configurable max turns and model selection

---

## Monitoring & Observability

| Tool | Port | Purpose |
|------|------|---------|
| Prometheus | 9090 | Metrics aggregation |
| Grafana | 3001 | Dashboards & visualization |
| Jaeger | 16686 | Distributed tracing |
| Loki | 3100 | Log aggregation |
| Node Exporter | 9100 | System metrics |

### Application Endpoints

- `GET /health` — JSON health status (VERSION_NEUTRAL — no version prefix)
- `GET /health/health-ui` — HTML health dashboard
- `GET /metrics` — Prometheus metrics
- `GET /tracing/status` — OpenTelemetry status

### Alert Rules (Prometheus)

- High error rate (>5% for 5 min)
- High P99 latency (>2s for 5 min)
- High concurrent requests (>500 for 2 min)
- Disk almost full (<15%)

---

## Configuration

See `.env.example` for all environment variables. Key sections:

- **Common** — PORT, NODE_ENV, CORS
- **Database** — PostgreSQL connection
- **Redis** — Cache and queue backend
- **Auth** — JWT secrets, OAuth credentials, MFA encryption
- **Media** — S3/Cloudinary credentials
- **Email** — SMTP/SES configuration
- **SMS** — Twilio/SNS credentials
- **Notifications** — FCM credentials
- **Webhooks** — Configured per-user via API
- **AI** — Anthropic/OpenAI API keys
- **Observability** — Prometheus, Grafana, Jaeger, Loki settings

---

## Troubleshooting

```bash
# Docker not running
docker ps  # If fails, start Docker Engine

# DB connection issues
pnpm db:dev:rm && pnpm db:dev:up

# Port in use
lsof -i :3000 && kill -9 <PID>

# Dependency issues
pnpm clean:all && pnpm install

# Verify health
curl http://localhost:3000/health

# Check tracing
curl http://localhost:3000/tracing/status
```

---

## AI-Agent Debugging Flow

This project is designed to be **AI-agent friendly**. Agents should follow this sequence:

1. `docker ps` — Verify Docker engine
2. `pnpm db:dev:up` — Start containers
3. `pnpm db:migrate` — Apply migrations
4. `pnpm start:dev` — Start application
5. `curl http://localhost:3000/health` — Verify health
6. Check observability stack (Prometheus, Grafana, Jaeger)

See `CLAUDE.md` for comprehensive AI development instructions.
See `docs/conventions/` for module creation patterns.

## Docs-First Development Policy

For behavior-changing work, this repository enforces **document first, code second**.

1. Update docs in `docs/` (or `README.md`) to define the flow and acceptance criteria.
2. Implement code only after the flow is documented.
3. Include tests and verification output.

Templates and policy:

- `docs/templates/feature-rfc.md`
- `AGENTS.md`
- `CONTRIBUTING.md`

---

## Resources

- [NestJS Docs](https://docs.nestjs.com/)
- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [OpenTelemetry](https://opentelemetry.io/docs/)
- [Playwright](https://playwright.dev/)
- [Artillery](https://artillery.io/)
