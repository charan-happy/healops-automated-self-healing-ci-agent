// ─── Billing Interfaces ─────────────────────────────────────────────────────
// Plan limit definitions and billing-related types.

export const PLAN_LIMITS = {
  free: { monthlyJobs: 100, monthlyTokenBudget: 1_000_000, maxRepos: 5 },
  pro: { monthlyJobs: 1000, monthlyTokenBudget: 10_000_000, maxRepos: -1 },
  enterprise: { monthlyJobs: 10000, monthlyTokenBudget: 100_000_000, maxRepos: -1 },
} as const;

export type PlanSlug = keyof typeof PLAN_LIMITS;

export interface PlanLimits {
  monthlyJobs: number;
  monthlyTokenBudget: number;
  maxRepos: number;
}

export interface UsageStats {
  organizationId: string;
  periodMonth: string;
  jobsUsed: number;
  jobsLimit: number;
  tokensUsed: number;
  tokensLimit: number;
  planSlug: string;
}
