const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

// ─── Token management ────────────────────────────────────────────────────────

let _accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function isDemoMode(): boolean {
  return _accessToken === "demo-token";
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (_accessToken) {
    headers["Authorization"] = `Bearer ${_accessToken}`;
  }
  return headers;
}

// ─── Auth Providers ─────────────────────────────────────────────────────────

export interface AuthProviders {
  email: boolean;
  google: boolean;
  github: boolean;
  apple: boolean;
}

export async function fetchAuthProviders(): Promise<AuthProviders> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/auth/providers`);
    if (!res.ok) return { email: true, google: false, github: false, apple: false };
    const body = (await res.json()) as ApiEnvelope<AuthProviders>;
    return body.data ?? { email: true, google: false, github: false, apple: false };
  } catch {
    return { email: true, google: false, github: false, apple: false };
  }
}

// ─── Auth API ────────────────────────────────────────────────────────────────

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export async function loginApi(email: string, password: string): Promise<TokenResponse> {
  const res = await fetch(`${BACKEND_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body as { message?: string } | null)?.message ?? "Login failed");
  }
  const body = (await res.json()) as ApiEnvelope<TokenResponse>;
  return body.data;
}

export async function registerApi(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
): Promise<TokenResponse> {
  const res = await fetch(`${BACKEND_URL}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, firstName, lastName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body as { message?: string } | null)?.message ?? "Registration failed");
  }
  const body = (await res.json()) as ApiEnvelope<TokenResponse>;
  return body.data;
}

export async function refreshTokenApi(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(`${BACKEND_URL}/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) throw new Error("Token refresh failed");
  const body = (await res.json()) as ApiEnvelope<TokenResponse>;
  return body.data;
}

export async function logoutApi(): Promise<void> {
  await fetch(`${BACKEND_URL}/v1/auth/logout`, {
    method: "POST",
    headers: authHeaders(),
  }).catch(() => {});
}

export async function createCheckoutSession(
  planSlug: string,
  successUrl: string,
  cancelUrl: string,
): Promise<{ url: string } | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/billing/checkout`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ planSlug, successUrl, cancelUrl }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<{ url: string }>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

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

export interface AgentStep {
  stage: string;
  displayName: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  details?: string;
}

export interface PipelineAttempt {
  attemptNumber: number;
  latencyMs: number | null;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
  patch: PipelinePatch | null;
  validations: PipelineValidation[];
  steps?: AgentStep[];
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
    const res = await fetch(`${BACKEND_URL}${path}`, {
      signal: controller.signal,
      headers: authHeaders(),
    });
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
      headers: authHeaders(),
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
  apiToken?: string;
  username?: string;
  appPassword?: string;
  workspace?: string;
  serverUrl?: string;
  scmProvider?: string;
}): Promise<unknown> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/onboarding/ci-provider`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errorBody = await res.json().catch(() => null);
      console.error("[configureCiProvider] failed:", res.status, errorBody);
      return null;
    }
    const body = (await res.json()) as ApiEnvelope<unknown>;
    return body.data ?? null;
  } catch (err) {
    console.error("[configureCiProvider] error:", err);
    return null;
  }
}

export async function selectRepositories(data: {
  repositories: Array<{ externalRepoId: string; name: string; defaultBranch?: string }>;
}): Promise<unknown> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/onboarding/repositories`, {
      method: "POST",
      headers: authHeaders(),
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
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<unknown>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

// ─── Organization Settings API ──────────────────────────────────────────────

import type { Organization, Member } from "./types/settings";

export interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export async function fetchOrganization(): Promise<Organization | null> {
  return fetchApi<Organization>("/v1/healops/settings/organization");
}

export async function updateOrganization(data: {
  name?: string;
  slackWebhookUrl?: string;
}): Promise<Organization | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/settings/organization`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<Organization>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

export async function fetchMembers(): Promise<Member[] | null> {
  return fetchApi<Member[]>("/v1/healops/settings/organization/members");
}

export async function inviteMember(
  email: string,
  role = "member",
): Promise<Invitation | null> {
  try {
    const res = await fetch(
      `${BACKEND_URL}/v1/healops/settings/organization/members/invite`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email, role }),
      },
    );
    if (!res.ok) {
      const errorBody = await res.json().catch(() => null);
      console.error("[inviteMember] failed:", res.status, errorBody);
      return null;
    }
    const body = (await res.json()) as ApiEnvelope<Invitation>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

export async function removeMember(userId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${BACKEND_URL}/v1/healops/settings/organization/members/${userId}`,
      { method: "DELETE", headers: authHeaders() },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchInvitations(): Promise<Invitation[] | null> {
  return fetchApi<Invitation[]>(
    "/v1/healops/settings/organization/invitations",
  );
}

export async function revokeInvitation(id: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${BACKEND_URL}/v1/healops/settings/organization/invitations/${id}`,
      { method: "DELETE", headers: authHeaders() },
    );
    return res.ok;
  } catch {
    return false;
  }
}

// ─── AI Config Settings API ─────────────────────────────────────────────────

export interface AIConfigResponse {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export async function fetchAiConfig(): Promise<AIConfigResponse | null> {
  return fetchApi<AIConfigResponse>("/v1/healops/settings/ai-config");
}

export async function updateAiConfig(data: {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}): Promise<unknown> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/settings/ai-config`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<unknown>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

// ─── Notification Settings API ──────────────────────────────────────────────

export interface NotificationSetting {
  id: string;
  channel: string;
  events: string[];
  config: Record<string, string>;
  isActive: boolean;
}

export async function fetchNotificationSettings(): Promise<NotificationSetting[] | null> {
  return fetchApi<NotificationSetting[]>("/v1/healops/settings/notifications");
}

export async function updateNotificationSettings(data: {
  channels: Array<{
    channel: string;
    enabled: boolean;
    config: Record<string, string>;
  }>;
  events: string[];
}): Promise<unknown> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/settings/notifications`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<unknown>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

// ─── API Keys Settings API ──────────────────────────────────────────────────

export async function fetchApiKeys(): Promise<Array<{
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}> | null> {
  return fetchApi<Array<{
    id: string;
    name: string;
    prefix: string;
    createdAt: string;
    lastUsedAt: string | null;
  }>>("/v1/healops/settings/api-keys");
}

export async function createApiKey(name: string): Promise<{
  key: string;
  prefix: string;
  id: string;
} | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/settings/api-keys`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<{ key: string; prefix: string; id: string }>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

export async function deleteApiKey(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/settings/api-keys/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Billing Portal API ─────────────────────────────────────────────────────

export async function createPortalSession(returnUrl: string): Promise<{ url: string } | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/billing/portal`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ returnUrl }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<{ url: string }>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

// ─── CI Provider Settings API ────────────────────────────────────────────────

import type { CIProviderConfig } from "./types/settings";

export interface CiProviderCreatePayload {
  provider: string;
  githubInstallationId?: string;
  accessToken?: string;
  serverUrl?: string;
  displayName?: string;
  scmProvider?: string;
}

export interface CiProviderUpdatePayload {
  isActive?: boolean;
  accessToken?: string;
  serverUrl?: string;
  displayName?: string;
  scmProvider?: string;
}

export interface AvailableRepo {
  externalRepoId: string;
  name: string;
  defaultBranch: string;
  language?: string;
  provider: string;
  providerConfigId: string;
}

export async function fetchCiProviders(): Promise<CIProviderConfig[] | null> {
  return fetchApi<CIProviderConfig[]>("/v1/healops/settings/ci-providers");
}

export async function addCiProvider(
  data: CiProviderCreatePayload,
): Promise<{ providerConfigId: string; provider: string } | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/settings/ci-providers`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<{ providerConfigId: string; provider: string }>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

export async function updateCiProvider(
  id: string,
  data: CiProviderUpdatePayload,
): Promise<CIProviderConfig | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/settings/ci-providers/${id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<CIProviderConfig>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

export async function deleteCiProvider(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/settings/ci-providers/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchAvailableRepos(
  providerConfigId: string,
): Promise<AvailableRepo[] | null> {
  return fetchApi<AvailableRepo[]>(
    `/v1/healops/settings/ci-providers/${providerConfigId}/repos`,
  );
}

// ─── SCM Provider Settings API ───────────────────────────────────────────────

import type { SCMProviderConfig } from "./types/settings";

export interface ScmProviderCreatePayload {
  provider: string;
  githubInstallationId?: string;
  accessToken?: string;
  serverUrl?: string;
  workspace?: string;
  displayName?: string;
}

export interface ScmProviderUpdatePayload {
  isActive?: boolean;
  accessToken?: string;
  serverUrl?: string;
  displayName?: string;
}

export async function fetchScmProviders(): Promise<SCMProviderConfig[] | null> {
  return fetchApi<SCMProviderConfig[]>("/v1/healops/settings/scm-providers");
}

export async function addScmProvider(
  data: ScmProviderCreatePayload,
): Promise<{ providerConfigId: string; provider: string; installUrl?: string } | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/settings/scm-providers`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<{ providerConfigId: string; provider: string; installUrl?: string }>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

export async function updateScmProvider(
  id: string,
  data: ScmProviderUpdatePayload,
): Promise<SCMProviderConfig | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/settings/scm-providers/${id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<SCMProviderConfig>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

export interface ScmAvailableRepo {
  externalRepoId: string;
  name: string;
  defaultBranch: string;
  language: string | null;
  isPrivate: boolean;
  url: string;
}

export async function fetchScmAvailableRepos(
  providerConfigId: string,
): Promise<{ provider: string; providerConfigId: string; repos: ScmAvailableRepo[] } | null> {
  return fetchApi<{ provider: string; providerConfigId: string; repos: ScmAvailableRepo[] }>(
    `/v1/healops/settings/scm-providers/${providerConfigId}/repos`,
  );
}

export async function deleteScmProvider(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/settings/scm-providers/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
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

// ─── Projects API ────────────────────────────────────────────────────────────

export interface ProjectResponse {
  id: string;
  name: string;
  repo: string;
  provider: string;
  branchCount: number;
  defaultBranch: string;
  lastActivity: string | null;
}

export interface BranchResponse {
  id: string;
  name: string;
  isDefault: boolean;
  author: string;
  commitCount: number;
  lastCommit: string;
  pipelineStatus: string;
}

export interface CommitResponse {
  id: string;
  sha: string;
  fullSha: string;
  message: string;
  author: string;
  timestamp: string;
  source: string;
  pipelineStatus: string;
  agentFixCount: number;
}

export async function fetchProjectsList(): Promise<ProjectResponse[] | null> {
  return fetchApi<ProjectResponse[]>("/v1/healops/projects");
}

export async function fetchProjectBranches(
  repositoryId: string,
  sync = true,
): Promise<BranchResponse[] | null> {
  return fetchApi<BranchResponse[]>(
    `/v1/healops/projects/${repositoryId}/branches?sync=${String(sync)}`,
  );
}

export async function fetchBranchCommits(
  repositoryId: string,
  branchId: string,
  limit = 30,
  offset = 0,
): Promise<CommitResponse[] | null> {
  return fetchApi<CommitResponse[]>(
    `/v1/healops/projects/${repositoryId}/branches/${branchId}/commits?limit=${limit}&offset=${offset}`,
  );
}

// ─── Public Reviews API ─────────────────────────────────────────────────────

export interface PublicReview {
  id: string;
  userName: string;
  userRole: string | null;
  userCompany: string | null;
  rating: number;
  title: string;
  comment: string;
  createdAt: string;
}

export interface ReviewStats {
  averageRating: number;
  totalCount: number;
  fiveStarCount: number;
}

export interface ReviewsListResponse {
  reviews: PublicReview[];
  total: number;
  limit: number;
  offset: number;
}

export async function fetchPublicReviews(
  limit = 20,
): Promise<ReviewsListResponse | null> {
  try {
    const res = await fetch(
      `${BACKEND_URL}/v1/healops/reviews?limit=${limit}`,
    );
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<ReviewsListResponse>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

export async function fetchReviewStats(): Promise<ReviewStats | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/reviews/stats`);
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<ReviewStats>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

export async function submitReview(data: {
  userName: string;
  userEmail?: string;
  userRole?: string;
  userCompany?: string;
  rating: number;
  title: string;
  comment: string;
}): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch {
    return false;
  }
}
