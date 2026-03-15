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

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (_accessToken) {
    headers["Authorization"] = `Bearer ${_accessToken}`;
  }
  return headers;
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

// ─── Invitation API ──────────────────────────────────────────────────────────

export async function acceptInvitation(
  token: string,
): Promise<{ accepted: boolean; organizationName: string } | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/invitations/accept`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(
        (body as { message?: string } | null)?.message ?? "Failed to accept invitation",
      );
    }
    const body = (await res.json()) as ApiEnvelope<{
      accepted: boolean;
      organizationName: string;
    }>;
    return body.data ?? null;
  } catch (err) {
    if (err instanceof Error) throw err;
    return null;
  }
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
  serverUrl?: string;
}): Promise<unknown> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/onboarding/ci-provider`, {
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

// ─── CI Provider Settings API ────────────────────────────────────────────────

import type { CIProviderConfig } from "./types/settings";

export interface CiProviderCreatePayload {
  provider: string;
  githubInstallationId?: string;
  accessToken?: string;
  serverUrl?: string;
  displayName?: string;
}

export interface CiProviderUpdatePayload {
  isActive?: boolean;
  accessToken?: string;
  serverUrl?: string;
  displayName?: string;
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

// ─── Auth: Email Verification, Password Reset ──────────────────────────────

export async function verifyEmailApi(token: string): Promise<{ verified: boolean }> {
  const res = await fetch(`${BACKEND_URL}/v1/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error("Email verification failed");
  const body = (await res.json()) as ApiEnvelope<{ verified: boolean }>;
  return body.data;
}

export async function forgotPasswordApi(email: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/v1/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body as { message?: string } | null)?.message ?? "Request failed");
  }
}

export async function resetPasswordApi(token: string, newPassword: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/v1/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, newPassword }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body as { message?: string } | null)?.message ?? "Password reset failed");
  }
}

// ─── Auth Providers API ─────────────────────────────────────────────────────

export interface AuthProviders {
  github: boolean;
  google: boolean;
}

export async function fetchAuthProviders(): Promise<AuthProviders | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/auth/providers`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<AuthProviders>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

export async function resendVerificationApi(email: string): Promise<void> {
  await fetch(`${BACKEND_URL}/v1/auth/resend-verification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

// ─── Demo Mode ──────────────────────────────────────────────────────────────

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("healops_refresh_token") === "demo-refresh";
}

// ─── Projects API ───────────────────────────────────────────────────────────

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
  author: string | null;
  commitCount: number;
  lastCommit: string | null;
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

export interface CommitDetailResponse {
  sha: string;
  message: string;
  author: { name: string; email: string; date: string };
  files: Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>;
}

export interface ProviderPipelineRun {
  id: string;
  name: string;
  status: string;
  conclusion: string | null;
  url: string;
  createdAt: string;
  completedAt: string | null;
}

export interface RepoCiLink {
  id: string;
  repositoryId: string;
  ciProviderConfigId: string;
  ciProviderType: string;
  displayName: string | null;
  isActive: boolean;
}

export interface ProviderJob {
  id: string;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ScmAvailableRepo {
  externalRepoId: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  language: string | null;
  isPrivate: boolean;
  url: string;
}

export interface AgentStep {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt: string | null;
  completedAt: string | null;
  output: string | null;
  error: string | null;
}

export interface ScmProviderConfig {
  id: string;
  providerType: string;
  displayName: string | null;
  isActive: boolean;
  hasToken: boolean;
  createdAt: string;
}

export async function fetchProjectsList(): Promise<ProjectResponse[] | null> {
  return fetchApi<ProjectResponse[]>("/v1/healops/projects");
}

export async function fetchProjectBranches(
  repositoryId: string,
  sync?: boolean,
): Promise<BranchResponse[] | null> {
  const q = sync ? "?sync=true" : "";
  return fetchApi<BranchResponse[]>(`/v1/healops/projects/${repositoryId}/branches${q}`);
}

export async function fetchBranchCommits(
  repositoryId: string,
  branchId: string,
  limit = 50,
  offset = 0,
): Promise<CommitResponse[] | null> {
  return fetchApi<CommitResponse[]>(
    `/v1/healops/projects/${repositoryId}/branches/${branchId}/commits?limit=${limit}&offset=${offset}`,
  );
}

export async function fetchCommitDetailFromBackend(
  repositoryId: string,
  commitSha: string,
): Promise<CommitDetailResponse | null> {
  return fetchApi<CommitDetailResponse>(
    `/v1/healops/projects/${repositoryId}/commits/${commitSha}`,
  );
}

export async function fetchProjectPipelines(
  repositoryId: string,
  branch?: string,
): Promise<ProviderPipelineRun[] | null> {
  const q = branch ? `?branch=${encodeURIComponent(branch)}` : "";
  return fetchApi<ProviderPipelineRun[]>(`/v1/healops/projects/${repositoryId}/pipelines${q}`);
}

export async function addRepositoriesToOrg(
  repositories: Array<{ externalRepoId: string; name: string; defaultBranch?: string; provider?: string; scmProviderConfigId?: string }>,
): Promise<unknown> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/projects/add`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ repositories }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<unknown>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

export async function fetchRepoCiLinks(repositoryId: string): Promise<RepoCiLink[] | null> {
  return fetchApi<RepoCiLink[]>(`/v1/healops/projects/${repositoryId}/ci-links`);
}

export async function addRepoCiLink(
  repositoryId: string,
  ciProviderConfigId: string,
): Promise<RepoCiLink | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/projects/${repositoryId}/ci-links`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ciProviderConfigId }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<RepoCiLink>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

export async function updateRepoCiLink(
  repositoryId: string,
  linkId: string,
  data: { isActive?: boolean },
): Promise<RepoCiLink | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/projects/${repositoryId}/ci-links/${linkId}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<RepoCiLink>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

export async function removeRepoCiLink(repositoryId: string, linkId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/projects/${repositoryId}/ci-links/${linkId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchCiProviderJobs(
  providerConfigId: string,
  owner: string,
  repo: string,
): Promise<ProviderJob[] | null> {
  return fetchApi<ProviderJob[]>(
    `/v1/healops/settings/ci-providers/${providerConfigId}/jobs?owner=${owner}&repo=${repo}`,
  );
}

// ─── SCM Provider Settings API ──────────────────────────────────────────────

export async function fetchScmProviders(): Promise<ScmProviderConfig[] | null> {
  return fetchApi<ScmProviderConfig[]>("/v1/healops/settings/scm-providers");
}

export async function fetchRepoHealth(): Promise<Array<{
  id: string;
  name: string;
  fullName: string;
  status: "healthy" | "degraded" | "failing";
  lastFixAt: string | null;
  totalFixes: number;
  successRate: number;
  openIssues: number;
}> | null> {
  return fetchApi<Array<{
    id: string;
    name: string;
    fullName: string;
    status: "healthy" | "degraded" | "failing";
    lastFixAt: string | null;
    totalFixes: number;
    successRate: number;
    openIssues: number;
  }>>("/v1/healops/dashboard/repo-health");
}

export async function fetchScmAvailableRepos(
  providerConfigId: string,
): Promise<ScmAvailableRepo[] | null> {
  return fetchApi<ScmAvailableRepo[]>(
    `/v1/healops/settings/scm-providers/${providerConfigId}/repos`,
  );
}

// ─── Organization Settings API ──────────────────────────────────────────────

export interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export async function fetchOrganization(): Promise<{
  id: string;
  name: string;
  slug: string;
  plan: string;
  slackWebhookUrl: string | null;
  createdAt: string;
} | null> {
  return fetchApi<{
    id: string;
    name: string;
    slug: string;
    plan: string;
    slackWebhookUrl: string | null;
    createdAt: string;
  }>("/v1/healops/settings/organization");
}

export async function updateOrganization(
  data: { name?: string; slackWebhookUrl?: string },
): Promise<{ id: string; name: string; slug: string; slackWebhookUrl: string | null; updated: boolean } | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/settings/organization`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<{ id: string; name: string; slug: string; slackWebhookUrl: string | null; updated: boolean }>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

export async function fetchMembers(): Promise<Array<{
  id: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  joinedAt: string;
}> | null> {
  return fetchApi<Array<{
    id: string;
    userId: string;
    email: string;
    name: string;
    role: string;
    joinedAt: string;
  }>>("/v1/healops/settings/organization/members");
}

export async function inviteMember(email: string, role = "member"): Promise<Invitation | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/settings/organization/members/invite`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email, role }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<Invitation>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

export async function removeMember(userId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/settings/organization/members/${userId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchInvitations(): Promise<Invitation[] | null> {
  return fetchApi<Invitation[]>("/v1/healops/settings/organization/invitations");
}

export async function revokeInvitation(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/healops/settings/organization/invitations/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}
