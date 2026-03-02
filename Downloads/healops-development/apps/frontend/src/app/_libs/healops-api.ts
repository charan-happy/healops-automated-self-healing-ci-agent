const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";

// ─── Response types from GET /v1/healops/pipeline-status/:commitSha ─────────

export interface PipelineValidation {
  stage: string;
  buildStatus: string;
  testStatus: string;
}

export interface PipelinePatch {
  filesModified: unknown;
  patchSize: number;
}

export interface PipelineAttempt {
  attemptNumber: number;
  latencyMs: number | null;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
  patch: PipelinePatch | null;
  validations: PipelineValidation[];
}

export interface PipelinePullRequest {
  prUrl: string;
  status: string;
  sourceBranch: string;
  targetBranch: string;
  isDraft: boolean;
}

export interface PipelineJob {
  id: string;
  status: string;
  classifiedFailureType: string | null;
  confidence: number | null;
  currentRetry: number;
  maxRetries: number;
  totalTokensUsed: number;
  startedAt: string | null;
  completedAt: string | null;
  attempts: PipelineAttempt[];
  pullRequest: PipelinePullRequest | null;
}

export interface PipelineFailure {
  id: string;
  errorSummary: string;
  affectedFile: string | null;
  affectedLine: number | null;
  language: string;
  job: PipelineJob | null;
}

export interface PipelineRun {
  id: string;
  status: string;
  workflowName: string | null;
  externalRunId: string;
  logUrl: string | null;
  agentBranch: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  failures: PipelineFailure[];
}

export interface PipelineStatusResponse {
  commitSha: string;
  commitMessage: string | null;
  commitAuthor: string | null;
  repository: string;
  branch: string;
  pipelineRuns: PipelineRun[];
}

// ─── API call ───────────────────────────────────────────────────────────────

// NestJS TransformInterceptor wraps all responses in this envelope
interface ApiEnvelope<T> {
  statusCode: number;
  status: string;
  message: string;
  data: T;
  error: string | null;
}

export async function fetchPipelineStatus(
  commitSha: string,
): Promise<PipelineStatusResponse | null> {
  try {
    const res = await fetch(
      `${BACKEND_URL}/v1/healops/pipeline-status/${commitSha}`,
    );
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<PipelineStatusResponse>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

// ─── Dashboard API ──────────────────────────────────────────────────────────

import type {
  DashboardMetrics,
  RecentJob,
  TrendDataPoint,
  CostBreakdownItem,
} from "./types/dashboard";

async function fetchApi<T>(path: string): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${BACKEND_URL}${path}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<T>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

export async function fetchDashboardMetrics(): Promise<DashboardMetrics | null> {
  return fetchApi<DashboardMetrics>("/v1/healops/dashboard/metrics");
}

export async function fetchRecentJobs(
  limit = 20,
): Promise<RecentJob[] | null> {
  return fetchApi<RecentJob[]>(
    `/v1/healops/dashboard/recent-jobs?limit=${limit}`,
  );
}

export async function fetchTrendData(
  period: "7d" | "30d" | "90d" = "30d",
): Promise<TrendDataPoint[] | null> {
  return fetchApi<TrendDataPoint[]>(
    `/v1/healops/dashboard/trends?period=${period}`,
  );
}

export async function fetchCostBreakdown(): Promise<
  CostBreakdownItem[] | null
> {
  return fetchApi<CostBreakdownItem[]>("/v1/healops/dashboard/cost-breakdown");
}

// ─── Onboarding API ─────────────────────────────────────────────────────────

import type { OnboardingStatus } from "./types/onboarding";

export async function fetchOnboardingStatus(): Promise<OnboardingStatus | null> {
  return fetchApi<OnboardingStatus>("/v1/healops/onboarding/status");
}

export async function createOrganization(data: {
  name: string;
  slackWebhookUrl?: string;
}): Promise<unknown> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/onboarding/organization`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<unknown>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

export async function configureCiProvider(data: {
  provider: string;
  githubInstallationId?: string;
  accessToken?: string;
  serverUrl?: string;
}): Promise<unknown> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/onboarding/ci-provider`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<unknown>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

export async function selectRepositories(data: {
  repositories: Array<{ externalRepoId: string; name: string; defaultBranch?: string }>;
}): Promise<unknown> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/onboarding/repositories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<unknown>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

export async function configureLlm(data: {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}): Promise<unknown> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/onboarding/llm-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<unknown>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

// ─── Billing API ────────────────────────────────────────────────────────────

import type { BillingPlan, Subscription, UsageStats } from "./types/settings";

export async function fetchBillingPlans(): Promise<BillingPlan[] | null> {
  return fetchApi<BillingPlan[]>("/v1/healops/billing/plans");
}

export async function fetchSubscription(): Promise<Subscription | null> {
  return fetchApi<Subscription>("/v1/healops/billing/subscription");
}

export async function fetchUsageStats(): Promise<UsageStats | null> {
  return fetchApi<UsageStats>("/v1/healops/billing/usage");
}
