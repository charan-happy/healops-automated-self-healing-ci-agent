# Docker Build Failures - Fixed Issues

## Summary
Backend and frontend Docker builds were failing in CI/CD pipelines due to workspace configuration mismatches and incorrect package manager usage.

---

## Issues Fixed

### 1. **dockerfile.frontend** - Critical Issues
**Problems:**
- Used `npm ci` instead of `pnpm install` (project uses pnpm@10.26.0)
- Missing root workspace files needed for dependency resolution
- Incorrect COPY paths for workspace context
- No pnpm setup in builder stage

**Fixes Applied:**
✅ Updated Stage 1 (Dependencies):
- Install `pnpm@10.26.0` globally
- Copy workspace files: `pnpm-lock.yaml`, `pnpm-workspace.yaml`, root `package.json`
- Use `pnpm install --frozen-lockfile --filter ./apps/frontend...`

✅ Updated Stage 2 (Builder):
- Install `pnpm@10.26.0` 
- Copy both frontend and workspace dependencies from Stage 1
- Use `pnpm run build` instead of `npm run build`
- Ensure correct working directory and source files

✅ Updated Stage 3 (Runner):
- Fixed COPY paths to use correct `.next/standalone`, `.next/static`, and `public` paths
- Properly set up non-root `nextjs` user
- Correct health check endpoint: `/api/health`

---

### 2. **dockerfile.backend** - Critical Issues
**Problems:**
- Missing `libs/client_sdk` dependency (backend depends on SDK)
- Workspace dependencies not properly resolved
- Missing `libs` folder in stage copies

**Fixes Applied:**
✅ Updated Stage 1 (Dependencies):
- Added `COPY libs/client_sdk/package.json ./libs/client_sdk/`
- Install with `--filter ./apps/backend...` (includes all dependencies)

✅ Updated Stage 2 (Builder):
- Copy `libs/client_sdk/node_modules` from Stage 1
- Copy entire `libs` folder for source resolution
- Ensure `pnpm run build` accesses both API and worker builds

✅ Verified Stage 3 (Runner):
- Correctly copies built artifacts from builder

---

### 3. **.github/workflows/build.yml** - CI/CD Configuration
**Problems:**
- No pnpm cache configuration
- Not using `--frozen-lockfile` for reproducible builds
- pnpm action version was outdated (v3 vs v4)

**Fixes Applied:**
✅ Added to both build-api and build-web jobs:
- Node.js setup caching: `cache: 'pnpm'`
- Cache dependency path: `cache-dependency-path: pnpm-lock.yaml`
- Updated pnpm action to v4
- Use `pnpm install --frozen-lockfile` for reproducible builds

---

## Testing the Fixes

### Local Build Testing
```bash
# Test backend build
docker build -f Docker/dockerfile.backend -t healops-backend:test .

# Test frontend build
docker build -f Docker/dockerfile.frontend -t healops-frontend:test .
```

### Key Path References
- **Backend** uses: `/app/apps/backend`, `/app/libs/client_sdk`
- **Frontend** uses: `/app/apps/frontend`
- **Workspace files** (required by both): `pnpm-lock.yaml`, `pnpm-workspace.yaml`, root `package.json`

---

## Files Modified
1. [Docker/dockerfile.backend](Docker/dockerfile.backend)
2. [Docker/dockerfile.frontend](Docker/dockerfile.frontend)
3. [.github/workflows/build.yml](.github/workflows/build.yml)

---

## Related Documentation
- See [Architecture.md](Architecture.md) for project structure
- See [apps/backend/README.md](apps/backend/README.md) for backend build info
- See [apps/frontend/README.md](apps/frontend/README.md) for frontend build info
