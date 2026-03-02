# CLAUDE.md — NestJS 11 Enterprise Boilerplate

## Tech Stack

NestJS 11, TypeScript 5.9 (very strict), Drizzle ORM (SQL-first), PostgreSQL, Redis (ioredis), BullMQ, pnpm 8.15.0

## Commands

```bash
pnpm start:dev              # Start API + Worker (concurrently)
pnpm type-check             # TypeScript strict check (run before committing)
pnpm lint                   # ESLint with auto-fix
pnpm test                   # Unit tests (Jest)
pnpm test:e2e               # E2E tests
pnpm local:up               # Full local setup: docker + migrate + start
pnpm db:migrate             # Apply SQL migrations
pnpm db:introspect          # Generate Drizzle schema from DB
pnpm db:create-migration <name>  # Create new empty SQL migration file
pnpm db:seed                # Run raw SQL seed files (roles, admin user)
pnpm db:studio              # Open Drizzle Studio
```

## TypeScript Strictness

The project uses maximum strictness. Key implications:

- `exactOptionalPropertyTypes` — cannot assign `undefined` to optional properties; use `?? defaultValue`
- `noUnusedLocals` / `noUnusedParameters` — prefix unused params with `_`
- `noUncheckedIndexedAccess` — array/object index access returns `T | undefined`
- `noPropertyAccessFromIndexSignature` — use bracket notation for index signatures
- `ConfigService.get<T>()` returns `T | undefined` — always use `?? defaultValue`

## Database (Drizzle ORM — SQL-First Workflow)

**Never use Drizzle Kit to generate migrations. Write raw SQL.**

1. Create migration: `pnpm db:create-migration <name>`
2. Write SQL in `src/db/drizzle/migrations/XXXX_<name>.sql`
3. Update journal: `src/db/drizzle/migrations/meta/_journal.json`
4. Apply: `pnpm db:migrate`
5. Regenerate schema: `pnpm db:introspect`
6. Schema output: `src/db/drizzle/schema.ts`

**Tables**: audit_logs, db_audit_logs, users, roles, permissions, user_roles, role_permissions, refresh_tokens, api_keys, mfa_settings, oauth_accounts, media, notifications, device_tokens, documents, document_chunks, conversations, messages, webhooks, webhook_deliveries

## Path Aliases (baseUrl: ./src)

```
@common/*  @config/*  @db/*  @redis/*  @otel/*  @bg/*  @auth/*  @users/*
@media/*  @email/*  @sms/*  @notifications/*  @ai/*  @metrics/*  @health/*
@middlewares/*  @interceptors/*  @logger/*  @cron/*
@email-queue/*  @notification-queue/*  @dead-letter-queue/*
```

## Architecture Patterns

### Repository Pattern (Centralized under src/db/)
ALL repositories live in `src/db/repositories/<domain>/`. The global `DBModule` registers and exports all repositories, so any business module can inject any repository without cross-module coupling.

```
Controller (HTTP layer) -> Service (business logic/facade) -> Repository (DB access via @db/repositories/...)
                                                           -> Provider (external services)
```

**Repository location**: `src/db/repositories/<domain>/<name>.repository.ts`
**Import pattern**: `import { UsersRepository } from '@db/repositories/users/users.repository'`

Existing repository domains:
- `src/db/repositories/auth/` — auth, token, mfa, api-key, oauth
- `src/db/repositories/users/` — users
- `src/db/repositories/media/` — media
- `src/db/repositories/notifications/` — notifications
- `src/db/repositories/ai/` — agents, rag
- `src/db/repositories/webhooks/` — webhooks
- `src/db/repositories/common/` — audit

### Provider/Strategy Pattern
External integrations use abstract base classes with swappable implementations:
- Media: S3Provider / CloudinaryProvider
- Email: SmtpProvider / SesProvider
- SMS: TwilioProvider / SnsProvider
- AI: ClaudeProvider / OpenAiProvider
- Notifications: FCM push

Provider selection is done via factory in module registration.

### Module Structure (follow for every new domain module)

```
src/<module>/                          # Business logic module
  <module>.module.ts
  <module>.controller.ts               # HTTP layer only, @Controller({ path: RouteNames.X, version: '1' })
  <module>.service.ts                  # Business logic (Facade pattern)
  providers/
    <abstract>.provider.ts             # Abstract base class
    <impl>.provider.ts                 # Concrete implementation(s)
  dto/                                 # class-validator + class-transformer + @nestjs/swagger
  interfaces/
  guards/ or decorators/               # If module-specific

src/db/repositories/<module>/          # Data access (separate from business module)
  <module>.repository.ts               # Drizzle queries only
```

### Existing Modules

| Module | Path | Purpose |
|--------|------|---------|
| Auth | `src/auth/` | JWT + OAuth (Google/GitHub) + API Keys + MFA (TOTP) |
| Users | `src/users/` | User CRUD with RBAC |
| Media | `src/media/` | File uploads (S3/Cloudinary) |
| Email | `src/email/` | Templated emails (SMTP/SES, Handlebars) |
| SMS | `src/sms/` | SMS + OTP (Twilio/SNS) |
| Notifications | `src/notifications/` | Multi-channel (FCM push, in-app) |
| AI | `src/ai/` | Claude/OpenAI, RAG pipeline (pgvector), Agent framework |
| Webhooks | `src/webhooks/` | Outbound webhooks with HMAC-SHA256 signatures |
| Gateway | `src/gateway/` | WebSocket gateway (Socket.IO) |
| Audit | `src/common/audit/` | Application-level audit logging (`@AuditLog()` decorator) |
| Export | `src/common/export/` | CSV/PDF/Excel data export service |
| Health | `src/api/health/` | Health checks (DB, Redis, memory, HTTP) |
| Metrics | `src/api/metrics/` | Prometheus metrics |
| Tracing | `src/api/tracing/` | OpenTelemetry distributed tracing |
| Dev Tools | `src/api/dev-tools/` | Developer tools dashboard |
| Background | `src/background/` | BullMQ queues + cron jobs |

## Auth System

- JWT access + refresh tokens with rotation on refresh
- Global guard order: ThrottlerGuard -> JwtAuthGuard -> RolesGuard -> PermissionsGuard
- `@Public()` — skips JWT guard
- `@Roles('admin', 'user')` — OR logic (any role matches)
- `@Permissions('users:read', 'users:write')` — AND logic (all required)
- `@CurrentUser()` — param decorator for authenticated user
- `@ApiKeyAuth()` — for API key authenticated routes
- Default role `user` assigned on register
- Seed roles: admin, user, moderator with 14 permissions
- Infrastructure endpoints (health, metrics, tracing, dev-tools) use `@Public()` to bypass JWT

## Conventions

### Naming
- Files: `kebab-case` (`user.service.ts`, `create-user.dto.ts`)
- Classes: `PascalCase` (`UserService`, `CreateUserDto`)
- Route names: centralized in `src/common/route-names.ts` (RouteNames enum)

### Controllers
- Business controllers: `@Controller({ path: RouteNames.X, version: '1' })` — URI versioning at `/v1/...`
- Infrastructure controllers (health, metrics, tracing, dev-tools): `@Controller({ path: RouteNames.X, version: VERSION_NEUTRAL })` — no version prefix (`/health`, `/metrics`)
- Always use `RouteNames` enum for controller paths — never raw strings
- No business logic — delegate to services
- Register all route slugs in `src/common/route-names.ts`

### Services
- Orchestrate repositories and providers (Facade pattern)
- No direct DB calls — use repository methods

### DTOs
- Use `class-validator` decorators for validation
- Use `class-transformer` for transformation
- Use `@nestjs/swagger` decorators (`@ApiProperty()`) for API docs

### Repositories
- Only place that imports from `@db/*` and runs Drizzle queries
- One repository per domain module

## Dev Tools & Observability

| Tool | URL | Purpose |
|------|-----|---------|
| Swagger v1 | `localhost:3000/api/v1` | API v1 documentation |
| Swagger | `localhost:3000/api` | Redirects to latest version |
| Bull Board | `localhost:3000/admin/queues` | Queue management |
| Prometheus | `localhost:9090` | Metrics |
| Grafana | `localhost:3001` | Dashboards |
| Jaeger | `localhost:16686` | Distributed tracing |
| Loki | `localhost:3100` | Log aggregation |

## Common Pitfalls

1. **ConfigService returns undefined** — `configService.get('KEY')` is `T | undefined`. Always provide a fallback: `configService.get('PORT') ?? 3000`
2. **Index access is `T | undefined`** — Due to `noUncheckedIndexedAccess`. Check before using: `const item = arr[0]; if (item) { ... }`
3. **Optional properties** — Due to `exactOptionalPropertyTypes`, you cannot do `{ prop: undefined }` on optional fields. Omit the key instead or use a type union `prop?: string | undefined`
4. **Migration journal** — After creating a SQL migration file, the journal at `meta/_journal.json` must have a matching entry. `pnpm db:create-migration` handles this automatically.
5. **pnpm may not be on PATH** — Use `npx` as fallback if `pnpm` is not found
6. **Worker process** — The app runs API and Worker concurrently. Worker entrypoint is `src/worker.main.ts`
