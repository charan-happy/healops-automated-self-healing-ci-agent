# Next.js Boilerplate — Create Next CoE

A production-ready Next.js boilerplate focused on performance, observability, analytics, type‑safety, and modern UI components, without vendor lock‑in. We've done the heavy lifting so you can ship faster. 🌍

## 📋 Table of Contents

### 🚀 Getting Started

- [🆕 New to These Tools?](#-new-to-these-tools)
- [🚀 Quick Start](#-quick-start-2-minutes)
- [📃 Available Scripts](#-available-scripts)
- [🗄️ Database Setup](#️-database-setup)
- [🧪 Testing](#-testing)
- [🚀 Deployment](#-deployment)

### 📊 Architecture & Advanced

- [📊 Architecture Overview](#-architecture-overview)
- [📡 Observability & Analytics](#-observability--analytics)
- [📕 OpenAPI Documentation](#-openapi-documentation)
- [🎨 Styling & UI Components](#-styling--ui-components)

### 📖 Reference

- [💻 Environment Variables](#-environment-variables)
- [📏 Development Guidelines](#-development-guidelines)
- [❓ Frequently Asked Questions](#-frequently-asked-questions)
- [🔎 Useful Routes](#-useful-routes)

### 📚 Additional Guides

- [🆕 Beginner's Guide](./BEGINNER_GUIDE.md) - New to these tools? Start here!
- [🧪 Testing Guide](./TESTING.md) - Comprehensive testing documentation

---

## 🚀 Quick Start (2 minutes)

```bash
# 1. Clone and install
git clone git@git.geekyants.com:geekyants/coe-grp/boilerplates/frontend/nextjs.git
cd nextjs

# Install dependencies (choose one)
pnpm install    # recommended
# yarn install

# 2. Set up environment (automated)
pnpm setup      # or: yarn setup

# 3. Start developing
pnpm dev        # or: yarn dev
```

That's it! Open `http://localhost:3000` and start building. 🎉

**Prerequisites:** Node.js ≥ 22, and one of:

- [pnpm](https://pnpm.io/) ≥ 10.15.0 (recommended)
- [yarn](https://yarnpkg.com/) ≥ 1.22.0

---

## 📚 What's Included

With this template, you get the following out of the box:

### 🏗️ **Core Framework**

- 🏎️ **[Next.js 15](https://nextjs.org/)**: App Router, React 19, typed routes, Turbopack dev
- 💅 **[Tailwind CSS v4](https://tailwindcss.com/)**: Utility‑first styling with prebuilt UI primitives
- ✨ **[ESLint](https://eslint.org/)** and **[Prettier](https://prettier.io/)**: Clean, consistent code
- 🛡️ **Type‑safe env with [@t3‑oss/env‑nextjs](https://env.t3.gg/)**: Build‑time validation via Zod

### 📊 **Analytics & Monitoring**

- 📈 **Analytics**: [PostHog](https://posthog.com) (dead‑clicks, heatmaps, performance), [Vercel Analytics](https://vercel.com/analytics), [Speed Insights](https://vercel.com/docs/speed-insights), [GTM](https://tagmanager.google.com) proxy
- 🧪 **Feature flags & experiments**: [PostHog](https://posthog.com) flags powering the homepage hero
- 🛡️ **Error tracking**: [Sentry](https://sentry.io) across client, server, and edge, unified with [PostHog](https://posthog.com)

### 🛠️ **Developer Experience**

- 🔎 **OpenAPI Reference**: Generated docs (via `next-openapi-gen`) rendered with Scalar at `/reference`
- 🧪 **Complete Testing Suite**: Unit, Integration, and E2E testing with Vitest and Playwright
- 🔐 **SEO**: OpenGraph, Twitter cards, sitemap, robots, JSON‑LD
- 🚀 **Performance tooling**: Bundle analyzer (`pnpm analyze`), optimized package imports
- 📦 **Absolute imports & path aliases**: `@/*`, `@/components/*`, `@/app/*`, etc.
- 🪝 **Husky pre‑commit**: Typecheck, circular‑dep check, lint, build

---

## 🆕 New to These Tools?

**Don't worry!** This template uses many modern tools that might seem overwhelming at first.

📖 **[Read our Beginner's Guide](./BEGINNER_GUIDE.md)** for simple explanations of everything, learning paths, and tips to get started.

**TL;DR:** You can start building right away with the Quick Start below - you don't need to understand everything immediately!

---

## 📃 Available Scripts

**Package Manager Note:** All scripts work with `pnpm` or `yarn`. Examples show `pnpm` but you can substitute with `yarn`.

### Development

- `setup`: 🆕 **Automated environment setup** (recommended for first-time setup)
- `dev`: Generate OpenAPI types and start Next dev with Turbopack
- `build`: Build the app for production
- `analyze`: Build with bundle analysis enabled
- `start`: Start the production server

### Code Quality

- `lint`: Lint `src` with ESLint
- `lint:fix`: Fix lint issues
- `format`: Format all files with Prettier
- `type:generate`: Generate typed routes (`next typegen`)
- `type:check`: Typecheck with `tsc --noEmit`
- `type:circular`: Detect circular dependencies with Madge

### Testing

**Unit & Integration Tests (Vitest):**

- `test:run`: Run all unit and integration tests
- `test:unit`: Run unit tests only (utility functions)
- `test:integration`: Run integration tests only (API endpoints)
- `test:ui`: Interactive Vitest UI mode
- `test:coverage`: Generate test coverage report

**E2E Tests (Playwright):**

- `test:e2e`: Run all E2E tests across browsers
- `test:e2e:headed`: Run tests in headed mode (visible browser)
- `test:e2e:ui`: Interactive Playwright UI mode
- `test:e2e:report`: View HTML test report
- `test:e2e:install`: Install Playwright browsers

### Database

- `db:generate`: Generate migrations from schema
- `db:migrate`: Apply migrations
- `db:*:studio`: Open Drizzle Studio for database exploration

**Pro tips:**

- Run `pnpm analyze` to enable the Next.js bundle analyzer
- Path aliases are configured in `tsconfig.json` (`@/*`, `@/components/*`, etc.)

---

## 🗄️ Database Setup

Drizzle ORM is configured with `drizzle-kit` for migrations and `src/db/client.ts` for runtime access. You can switch between Postgres, MySQL, and SQLite.

- **Schemas**: `src/db/schema/postgres.ts`, `src/db/schema/mysql.ts`, `src/db/schema/sqlite.ts`
- **Migrations output**: `src/db/drizzle/<dialect>`
- **Config**: `drizzle.config.ts` uses `DB_DIALECT` and `DATABASE_URL`
- **Runtime client**: `src/db/client.ts` auto‑selects the driver based on `DB_DIALECT`

### Database Options

- **SQLite** (default): Zero setup, perfect for development
- **PostgreSQL**: Run `pnpm docker:up` (or `yarn docker:up`) for local instance
- **MySQL**: Run `pnpm docker:up` (or `yarn docker:up`) for local instance

### Setup Steps

1. **Start a local database** (optional, for Postgres/MySQL)

   ```bash
   pnpm docker:up        # starts postgres, mysql, redis
   # yarn docker:up      # or with yarn

   pnpm docker:logs      # follow logs (optional)
   # pnpm docker:down    # stop services
   ```

2. **Set environment variables** (add to `.env`)

   ```bash
   # SQLite (default)
   DB_DIALECT=sqlite
   DATABASE_URL=./create-next-coe.db

   # PostgreSQL
   DB_DIALECT=postgresql
   DATABASE_URL=postgres://user:password@localhost:5432/dbname

   # MySQL
   DB_DIALECT=mysql
   DATABASE_URL=mysql://user:password@localhost:3306/dbname
   ```

3. **Generate and run migrations**

   ```bash
   pnpm db:generate   # generate SQL migrations from schema
   pnpm db:migrate    # apply migrations
   ```

4. **Explore with Drizzle Studio**
   ```bash
   pnpm db:sqlite:studio    # for SQLite
   pnpm db:pg:studio        # for PostgreSQL
   pnpm db:mysql:studio     # for MySQL
   ```

---

## 🧪 Testing

This project includes a **complete 3-layer testing strategy** with Unit, Integration, and E2E testing - providing enterprise-grade quality assurance.

### Quick Start

```bash
# Run all tests (unit + integration)
pnpm test:run

# Run unit tests only
pnpm test:unit

# Run integration tests only
pnpm test:integration

# Run E2E tests (browser testing)
pnpm test:e2e

# Interactive testing modes
pnpm test:ui              # Vitest UI mode
pnpm test:e2e:ui         # Playwright UI mode
```

### Complete Test Structure

```
src/
├── app/_libs/utils/
│   └── math.test.ts           # Unit tests (8 tests)
├── test/
│   ├── setup.ts               # Global test configuration
│   └── integration/
│       └── api-routes.integration.test.ts  # API integration tests (9 tests)
└── tests/e2e/                 # End-to-end tests (120+ tests)
    ├── homepage.spec.ts        # Homepage functionality
    ├── api.spec.ts             # API routes testing
    ├── navigation.spec.ts      # Navigation & routing
    ├── performance.spec.ts     # Performance & Web Vitals
    └── utils.ts               # Test utilities
```

### 🎯 Testing Pyramid

**🔧 Unit Tests (8 tests):** Individual functions and utilities

- Math operations, utility functions
- Fast execution, isolated testing

**📊 Integration Tests (9 tests):** API endpoints and service integration

- API route functionality (`/api/health`, `/api/simple-users`, `/api/users`)
- Data validation and error handling
- Service layer integration

**🌐 E2E Tests (120+ tests):** Full user workflows across browsers

- Multi-browser testing (Chrome, Firefox, Safari, Mobile)
- Performance monitoring and Web Vitals
- Visual regression testing

### Live Testing Demo

Visit **`/users`** to see a live example of the integration testing patterns in action with hardcoded user data.

### Test Coverage & Quality

**✅ All Tests Passing:** 17/17 unit + integration tests  
**✅ Cross-Browser E2E:** 120+ tests across 5 browsers  
**✅ Type Safety:** Strict TypeScript with no `any` types  
**✅ Performance:** Web Vitals monitoring included  
**✅ CI/CD Ready:** All tests automated for continuous integration

📖 **Want to learn more?** Check out our comprehensive [Testing Guide](./TESTING.md) for detailed information about our testing philosophy, advanced features, and best practices.

---

## 🚀 Deployment

Deploy on Vercel in minutes:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=git@git.geekyants.com:geekyants/coe-grp/boilerplates/frontend/nextjs.git)

---

## 📊 Architecture Overview

The following sequence diagram illustrates the key application flows including request handling, analytics tracking, error monitoring, and feature flag evaluation:

```mermaid
sequenceDiagram
    participant User as 👤 User
    participant Browser as 🌐 Browser
    participant NextJS as ⚡ Next.js App
    participant Middleware as 🔄 Middleware
    participant PostHog as 📊 PostHog
    participant Sentry as 🚨 Sentry
    participant GTM as 📈 GTM
    participant DB as 🗄️ Database
    participant API as 🔌 API Routes

    Note over User, API: 🚀 Application Request Flow

    User->>Browser: Navigate to page
    Browser->>NextJS: HTTP Request

    NextJS->>Middleware: Process request
    Middleware->>NextJS: Environment validation (Zod)

    alt Happy Path
        NextJS->>DB: Query data (Drizzle ORM)
        DB-->>NextJS: Return data
        NextJS->>PostHog: Track page view
        PostHog-->>NextJS: Feature flags
        NextJS->>Browser: Render page with analytics
        Browser->>GTM: Send analytics events
        Browser->>PostHog: Track user interactions
    else Error Path
        NextJS->>Sentry: Capture server error
        NextJS->>PostHog: Capture exception
        NextJS->>Browser: Error boundary/page
    end

    Note over User, API: 🎯 Feature Flag Flow

    Browser->>PostHog: Request feature flags
    PostHog-->>Browser: Return flag variants
    Browser->>NextJS: Render based on flags
    NextJS-->>Browser: Dynamic content

    Note over User, API: 🔌 API Request Flow

    User->>Browser: API call
    Browser->>API: HTTP Request to /api/*
    API->>NextJS: Route handler

    alt Success
        API->>DB: Database operation
        DB-->>API: Data response
        API->>PostHog: Track API usage
        API-->>Browser: JSON response
    else Error
        API->>Sentry: Log API error
        API->>PostHog: Track error event
        API-->>Browser: Error response
    end

    Note over User, API: 📚 OpenAPI Documentation Flow

    User->>Browser: Visit /reference
    Browser->>NextJS: Request API docs
    NextJS->>NextJS: Load openapi.json
    NextJS-->>Browser: Scalar UI with API docs

    Note over User, API: 🔍 Observability & Monitoring

    loop Continuous Monitoring
        NextJS->>PostHog: Performance metrics
        NextJS->>Sentry: Error tracking
        NextJS->>GTM: Custom events
        Browser->>PostHog: User behavior data
    end
```

### Key Flow Highlights:

- **🔒 Type-Safe Environment**: All requests validated through Zod schemas
- **📊 Multi-Analytics**: PostHog, Sentry, GTM, and Vercel Analytics working in harmony
- **🎯 Feature Flags**: Real-time flag evaluation for A/B testing and gradual rollouts
- **🚨 Error Handling**: Comprehensive error tracking across client, server, and edge
- **🔌 API Documentation**: Auto-generated OpenAPI docs with Scalar UI
- **🗄️ Multi-Database**: Flexible database support with Drizzle ORM

---

## 📡 Observability & Analytics

- **PostHog**: Privacy‑friendly analytics, session replays, heatmaps, feature flags.
  - Proxied via Next rewrites to `/ingest` to reduce ad‑blocker impact.
  - Server and client capture are configured; exceptions are unified with Sentry.
- **Sentry**: Error tracking for client, server, and edge.
  - Source maps uploaded on build; tunnel at `/monitoring`.
- **Vercel Analytics** and **Speed Insights** are wired in.
- **Google Tag Manager**: Proxied endpoints (e.g., `/gm`, `/gtm/:path*`).

---

## 📕 OpenAPI Documentation

- Author API routes under `src/app/api` and keep your OpenAPI schema updated.
- The UI at `/reference` renders `public/openapi.json` with Scalar.
- During dev, `pnpm dev` runs `next-openapi-gen generate` before starting the dev server.

---

## 🎨 Styling & UI Components

- **Tailwind CSS v4** for styling.
- A modern, accessible component set lives in `src/components/ui` (buttons, dialogs, tables, sheets, charts, forms, and more).

---

## 💻 Environment Variables

### 🚀 Quick Setup (Most Common)

For development, you only need these essential variables:

```bash
# Basic app info (required)
NEXT_PUBLIC_APP_TITLE="Your App Name"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Database (SQLite is simplest for dev)
DB_DIALECT="sqlite"
DATABASE_URL="./your-app.db"
```

### 📊 With Analytics (Optional)

Add these if you want analytics and error tracking:

```bash
# PostHog (analytics & feature flags)
NEXT_PUBLIC_POSTHOG_KEY="your-posthog-key"

# Sentry (error tracking)
SENTRY_AUTH_TOKEN="your-sentry-token"

# Google Tag Manager (optional)
NEXT_PUBLIC_GTM_KEY="your-gtm-id"
```

### 🗄️ Database Options

Choose one database setup:

```bash
# Option 1: SQLite (easiest for development)
DB_DIALECT="sqlite"
DATABASE_URL="./create-next-coe.db"

# Option 2: PostgreSQL
DB_DIALECT="postgresql"
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"

# Option 3: MySQL
DB_DIALECT="mysql"
DATABASE_URL="mysql://user:password@localhost:3306/dbname"
```

### 📋 Complete Reference

<details>
<summary>Click to see all available environment variables</summary>

```bash
# Development
NODE_ENV="development"
ANALYZE="false"

# App Configuration
NEXT_PUBLIC_APP_ENV="development"
NEXT_PUBLIC_APP_TITLE="Your App Title"
NEXT_PUBLIC_APP_NAME="Your App Name"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_DESCRIPTION="Your app description"
NEXT_PUBLIC_APP_CATEGORY="Your category"
NEXT_PUBLIC_APP_KEYWORDS="your,keywords,here"

# Analytics (all optional for development)
NEXT_PUBLIC_GTM_KEY=""
POSTHOG_API_KEY=""
POSTHOG_ENV_ID=""
NEXT_PUBLIC_POSTHOG_KEY=""
NEXT_PUBLIC_POSTHOG_HOST="https://eu.i.posthog.com"
NEXT_PUBLIC_POSTHOG_INGEST="/ingest"
NEXT_PUBLIC_POSTHOG_ENVIRONMENT="development"
SENTRY_AUTH_TOKEN=""

# Database
DB_DIALECT="sqlite"
DATABASE_URL="./create-next-coe.db"
```

</details>

**💡 Pro Tip:** Use `pnpm setup` to automatically configure your environment!

---

## 📏 Development Guidelines

### Conventions

- **File and folder names must be kebab-case**. Do not use PascalCase, camelCase, or snake_case.
- **Co-locate by usage hierarchy**: place folders and libraries within the app areas they serve. Follow Next.js colocation with `_private` folders as needed (see the [Next.js colocation docs](https://nextjs.org/docs/app/getting-started/project-structure#colocation)).

### Package Management

- **Stick to the versions specified in this boilerplate** - they are tested and work together
- **Do not update packages individually** without testing the entire application
- **If you encounter version conflicts** with your existing packages, reach out to [ruchika@geekyants.com](mailto:ruchika@geekyants.com) for guidance

### Code Quality

- Detect circular dependencies: `pnpm type:circular` or `yarn type:circular`
- All code is automatically formatted with Prettier
- ESLint catches common issues and enforces best practices
- Husky runs pre-commit checks (typecheck, lint, circular dependency check)

### Guidelines

- **Read this README** to understand the setup and conventions
- **Remove unneeded pieces** based on your project requirements
- **Test thoroughly** after making any changes to dependencies

### Maintenance Note

- **Dependencies will be updated every 15 days** by the maintainers

---

## ❓ Frequently Asked Questions

### **Q: I'm getting package version conflicts when adding new dependencies**

**A:** This boilerplate uses carefully tested package versions that work together. If you need to add a package that conflicts with existing versions:

1. **Don't update existing packages** - this can break the carefully balanced dependencies
2. **Try using the conflicting package's compatible version** that works with our setup
3. **If you must update core packages**, reach out to [ruchika@geekyants.com](mailto:ruchika@geekyants.com) for guidance
4. **Test thoroughly** - run `yarn build`, `yarn lint`, and `yarn type:check` after any changes

### **Q: Can I update Next.js or React to the latest version?**

**A:** Please don't update major dependencies without consultation. This boilerplate is tested with specific versions. Contact [ruchika@geekyants.com](mailto:ruchika@geekyants.com) if you need newer versions.

### **Q: My IDE shows TypeScript errors after adding a new package**

**A:** This usually indicates version conflicts. Check if the new package requires different versions of `@types/*` packages. Stick to the versions in our `package.json` or contact [ruchika@geekyants.com](mailto:ruchika@geekyants.com).

### **Q: Should I use pnpm or yarn?**

**A:** Both work perfectly! Use **pnpm** for better performance and disk efficiency, or **yarn** if your team prefers it. All scripts work with both.

### **Q: How do I know if my changes broke something?**

**A:** Run these commands after any dependency changes:

```bash
# Choose your package manager
pnpm build && pnpm lint && pnpm type:check
# or
yarn build && yarn lint && yarn type:check
```

### **Q: Something is missing that's common to all projects?**

**A:** This boilerplate is continuously improved based on real project needs. If you find something missing that would benefit all projects, please reach out to [ruchika@geekyants.com](mailto:ruchika@geekyants.com) with:

- **What's missing**: Describe the feature/tool/pattern needed
- **Why it's needed**: Explain the use case and benefits
- **How common it is**: Is this needed across multiple projects?
- **Suggested implementation**: If you have ideas on how to add it

Your feedback helps make this boilerplate better for everyone! 🚀

---

## 🔎 Useful Routes

### Core Pages

- **Marketing page**: `/`
- **Complete showcase**: `/showcase` - Comprehensive overview of all boilerplate features
- **Integration testing demo**: `/users` - Live example with hardcoded user data
- **API Reference (Scalar)**: `/reference` (reads from `/openapi.json`)

### API Endpoints

- **Health check**: `/api/health` - System status and uptime
- **Simple users**: `/api/simple-users` - Returns 2 hardcoded users (for testing)
- **User management**: `/api/users` - Full CRUD operations with validation
- **Example OpenAPI route**: `/api/openapi/[id]`
- **Sentry example API**: `/api/sentry-example-api`

### System Routes

- **Sitemap**: `/sitemap.xml`
- **Robots**: `/robots.txt`
- **Auth states**: `/unauthorized`, `/forbidden`
