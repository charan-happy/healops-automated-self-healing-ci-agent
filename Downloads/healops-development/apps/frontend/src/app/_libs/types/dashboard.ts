export interface DashboardMetrics {
  mttr: number;
  successRate: number;
  totalFixes: number;
  costSavings: number;
  mttrTrend: number;
  successRateTrend: number;
  totalFixesTrend: number;
  costSavingsTrend: number;
}

export interface RecentJob {
  id: string;
  repository: string;
  branch: string;
  commitSha: string;
  status:
    | "pending"
    | "analyzing"
    | "fixing"
    | "validating"
    | "completed"
    | "failed"
    | "escalated";
  failureType: string;
  confidence: number;
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  attempts: number;
  prUrl: string | null;
}

export interface TrendDataPoint {
  date: string;
  fixes: number;
  successRate: number;
  failures: number;
}

export interface RepoHealth {
  id: string;
  name: string;
  fullName: string;
  status: "healthy" | "degraded" | "failing";
  lastFixAt: string | null;
  totalFixes: number;
  successRate: number;
  openIssues: number;
}

export interface CostBreakdownItem {
  repoName: string;
  totalJobs: number;
  successRate: number;
  totalTokens: number;
  estimatedCost: number;
}
