// ─── Error Types Seed Data ───────────────────────────────────────────────────
// These are the 26 failure categories HealOps can detect and classify.
// Tier A: auto-fixable, Tier B: partially fixable, Tier C: escalation-only.
// Run via: pnpm db:seed:healops

export const ERROR_TYPES_SEED = [
  // ─── Tier A: Fully Auto-Fixable ──────────────────────────────────────────
  {
    code: 'SYNTAX_ERROR',
    description: 'Missing braces, parentheses, or semicolons',
    severity: 'high' as const,
    is_auto_fixable: true,
  },
  {
    code: 'IMPORT_ERROR',
    description: 'Missing imports or incorrect module paths',
    severity: 'high' as const,
    is_auto_fixable: true,
  },
  {
    code: 'DTO_INTERFACE_ERROR',
    description: 'Type mismatches or missing interface properties',
    severity: 'medium' as const,
    is_auto_fixable: true,
  },
  {
    code: 'TYPE_ERROR',
    description: 'TypeScript compilation type violations',
    severity: 'high' as const,
    is_auto_fixable: true,
  },
  {
    code: 'EXPORT_ERROR',
    description: 'Functions or classes not exported from modules',
    severity: 'medium' as const,
    is_auto_fixable: true,
  },
  {
    code: 'BUILD_CONFIGURATION_ERROR',
    description: 'Framework decorators or configuration errors',
    severity: 'high' as const,
    is_auto_fixable: true,
  },
  {
    code: 'TEST_FAILURE',
    description: 'Incorrect assertions or wrong expected values',
    severity: 'medium' as const,
    is_auto_fixable: true,
  },
  {
    code: 'MISSING_DEPENDENCY',
    description: 'Package used but not in package.json',
    severity: 'high' as const,
    is_auto_fixable: true,
  },
  {
    code: 'DEPENDENCY_VERSION_CONFLICT',
    description: 'Incompatible package peer dependency versions',
    severity: 'high' as const,
    is_auto_fixable: true,
  },
  {
    code: 'PACKAGE_JSON_ERROR',
    description: 'Syntax errors or malformed package.json',
    severity: 'high' as const,
    is_auto_fixable: true,
  },
  {
    code: 'RUNTIME_ERROR',
    description: 'Runtime TypeError, ReferenceError, or null dereference during CI execution',
    severity: 'high' as const,
    is_auto_fixable: true,
  },
  {
    code: 'LINT_ERROR',
    description: 'ESLint, Prettier, or other linter violations that fail CI',
    severity: 'low' as const,
    is_auto_fixable: true,
  },
  {
    code: 'TEST_TIMEOUT',
    description: 'Tests exceeding timeout due to missing await, unresolved promises, or infinite loops',
    severity: 'medium' as const,
    is_auto_fixable: true,
  },
  {
    code: 'DOCKER_BUILD_ERROR',
    description: 'Dockerfile COPY/RUN failures, missing files, or multi-stage build errors',
    severity: 'high' as const,
    is_auto_fixable: true,
  },
  {
    code: 'CI_YAML_ERROR',
    description: 'GitHub Actions workflow YAML syntax or schema validation errors',
    severity: 'high' as const,
    is_auto_fixable: true,
  },
  {
    code: 'CSS_STYLE_ERROR',
    description: 'CSS, SCSS, Tailwind, or CSS-in-JS compilation errors',
    severity: 'low' as const,
    is_auto_fixable: true,
  },
  {
    code: 'GRAPHQL_CODEGEN_ERROR',
    description: 'GraphQL schema validation, query errors, or codegen configuration failures',
    severity: 'medium' as const,
    is_auto_fixable: true,
  },
  {
    code: 'NEXT_BUILD_ERROR',
    description: 'Next.js build errors including Server/Client Component boundary violations',
    severity: 'high' as const,
    is_auto_fixable: true,
  },
  {
    code: 'MONOREPO_CONFIG_ERROR',
    description: 'Nx, Turborepo, or pnpm workspace configuration and path resolution errors',
    severity: 'high' as const,
    is_auto_fixable: true,
  },

  // ─── Tier B: Partially Auto-Fixable ──────────────────────────────────────
  {
    code: 'SECURITY_VULNERABILITY',
    description: 'npm audit, Snyk, or Dependabot security scan failures',
    severity: 'high' as const,
    is_auto_fixable: true,
  },
  {
    code: 'SNAPSHOT_MISMATCH',
    description: 'Jest, Vitest, or Storybook snapshot test mismatches',
    severity: 'low' as const,
    is_auto_fixable: true,
  },

  // ─── Tier C: Escalation-Only (not auto-fixable) ──────────────────────────
  {
    code: 'ENV_CONFIG_ERROR',
    description: 'Missing environment variables or misconfigured framework settings',
    severity: 'medium' as const,
    is_auto_fixable: false,
  },
  {
    code: 'COVERAGE_THRESHOLD',
    description: 'Code coverage below required threshold — requires new tests',
    severity: 'low' as const,
    is_auto_fixable: false,
  },
  {
    code: 'DATABASE_MIGRATION_ERROR',
    description: 'Database migration failures — high risk of data loss, requires manual review',
    severity: 'high' as const,
    is_auto_fixable: false,
  },
  {
    code: 'SECRET_DETECTED',
    description: 'Secret/credential detected in source code — requires rotation and git history cleanup',
    severity: 'high' as const,
    is_auto_fixable: false,
  },
  {
    code: 'INFRASTRUCTURE_ERROR',
    description: 'CI runner OOM, network failures, rate limits, or platform outages — not fixable in code',
    severity: 'high' as const,
    is_auto_fixable: false,
  },
];
