# Frontend — CLAUDE.md

## What This App Does

HealOps frontend is the UI for an autonomous pipeline healing agent. It lets users browse their GitHub repositories, branches, and commits — and (eventually) see automated pipeline fixes applied by the agent.

Currently the frontend fetches **real data from the GitHub API** via a GitHub App installation.

## Tech Stack

- **Next.js 15** (App Router, React 19, Turbopack)
- **TypeScript 5.9** (strict)
- **Tailwind CSS v4** with shadcn/ui components in `src/app/_components/ui/`
- **Framer Motion** for page transitions and animations
- **pnpm** as package manager

## GitHub API Integration

### Why `jose`?

The GitHub App authenticates by signing a **JWT with RS256** using its private key. Node's `crypto` module doesn't work in Next.js client components (browser environment). **`jose`** is the only maintained, browser-compatible library that can sign JWTs with RSA keys via the Web Crypto API.

### Why `octokit`?

**`octokit`** is GitHub's official REST API SDK. Once we exchange the JWT for an installation access token, Octokit gives us fully typed, ergonomic methods for every GitHub endpoint (`listBranches`, `listCommits`, `getCommit`, etc.) instead of manual `fetch` calls with headers and URL construction.

### Auth Flow

```
Private Key (base64 in env) → jose signs JWT (RS256) → POST /app/installations/{id}/access_tokens → installation token → Octokit instance
```

The token is cached in-memory and re-fetched only when expired.

### Key Files

| File | Purpose |
|------|---------|
| `src/app/_libs/github/github-client.ts` | JWT signing (jose + Web Crypto), token exchange, Octokit factory |
| `src/app/_libs/github/github-service.ts` | Data-fetching layer: `fetchRepos()`, `fetchBranches()`, `fetchCommits()`, `fetchCommitDetail()` |
| `src/app/_libs/mockData.ts` | Type definitions (`Project`, `Branch`, `Commit`, `AgentFix`) + legacy mock data |

### Environment Variables

```env
NEXT_PUBLIC_GITHUB_APP_ID=         # GitHub App ID (numeric)
NEXT_PUBLIC_GITHUB_PRIVATE_KEY=    # Base64-encoded .pem private key
NEXT_PUBLIC_GITHUB_INSTALLATION_ID= # Installation ID for the target org/user
```

> **Note:** These are `NEXT_PUBLIC_` because the API calls happen client-side. This is intentional for the demo — in production, move to a server-side API route.

## App Structure

### Routing (Next.js App Router)

| Route | Page Component | What It Shows |
|-------|---------------|---------------|
| `/projects` | `ProjectsPage` | List of repos from GitHub App installation, expandable to show branches inline |
| `/branches?projectId=owner--repo` | `BranchesPage` | Branches for a repo with commit counts |
| `/commits?projectId=owner--repo&branchId=name` | `CommitsPage` | Commits on a branch |
| `/fix-details?projectId=...&branchId=...&commitId=sha` | `FixDetailsPage` | Full commit detail: diff, files changed, stats |

### URL Scheme

- `projectId` = `owner--repo` (double-dash separator, URL-safe)
- `branchId` = branch name (as-is)
- `commitId` = full SHA

### Component Hierarchy

```
RootLayout (layout.tsx)
├── AppBreadcrumb — derives display names from query params
└── Page content
    ├── ProjectsPage — expandable repos with inline branches
    ├── BranchesPage → BranchList component
    ├── CommitsPage → CommitTimeline component
    └── FixDetailsPage — commit detail with file diffs
```

### Shared Components

| Component | Props | Used By |
|-----------|-------|---------|
| `BranchList` | `branches: Branch[], selectedBranchId, onSelectBranch` | BranchesPage |
| `CommitTimeline` | `commits: Commit[], selectedCommitId, onSelectCommit` | CommitsPage |
| `StatusBadge` | `status: PipelineStatus` | BranchList, CommitTimeline |
| `PageTransition` | `children, className` | All pages |

## Conventions

- All pages are `'use client'` components with `useState`/`useEffect` for data fetching
- Loading state: `<Loader2 className="animate-spin text-brand-cyan" />`
- Error state: `<p className="text-red-400">Failed to load X: {error}</p>`
- Search inputs: consistent styling with `Search` icon, `rounded-xl`, `border-border/50`, `bg-card/80`
- Lists are sorted by latest date by default (repos by `pushed_at`, branches by last commit date, commits by date)
- All pages have a search box that filters client-side

## Commands

```bash
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Production build
pnpm type:check   # TypeScript check
pnpm lint         # ESLint
pnpm test:run     # Run tests
```
