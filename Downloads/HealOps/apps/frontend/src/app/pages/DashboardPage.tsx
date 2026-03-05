"use client";

import { useCallback, useEffect, useState } from "react";
import PageTransition from "../_components/PageTransition";
import { MetricsGrid } from "../_components/dashboard/MetricsGrid";
import { TrendChart } from "../_components/dashboard/TrendChart";
import { RecentActivityFeed } from "../_components/dashboard/RecentActivityFeed";
import { RepoHealthGrid } from "../_components/dashboard/RepoHealthGrid";
import {
  fetchDashboardMetrics,
  fetchRecentJobs,
  fetchTrendData,
  fetchCiProviders,
  fetchScmProviders,
  isDemoMode,
} from "../_libs/healops-api";
import type { DashboardMetrics, RecentJob, TrendDataPoint, RepoHealth } from "../_libs/types/dashboard";
import type { CIProviderConfig, SCMProviderConfig } from "../_libs/types/settings";
import { CheckCircle2, XCircle, GitBranch, FolderGit2, Settings } from "lucide-react";
import Link from "next/link";

// ─── Demo data (used when backend is unreachable) ──────────────────────────

const DEMO_METRICS: DashboardMetrics = {
  mttr: 142,
  successRate: 87.3,
  totalFixes: 1284,
  costSavings: 48200,
  mttrTrend: -12.5,
  successRateTrend: 4.2,
  totalFixesTrend: 18.7,
  costSavingsTrend: 22.1,
};

function generateTrendData(days: number): TrendDataPoint[] {
  const data: TrendDataPoint[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    const fixes = Math.floor(Math.random() * 12) + 3;
    const failures = Math.floor(Math.random() * 4) + 1;
    data.push({
      date: label,
      fixes,
      successRate: Math.min(100, 70 + Math.random() * 25),
      failures,
    });
  }
  return data;
}

const DEMO_JOBS: RecentJob[] = [
  { id: "j1", repository: "acme/frontend", branch: "main", commitSha: "a1b2c3d", status: "completed", failureType: "test_failure", confidence: 0.94, startedAt: new Date(Date.now() - 300000).toISOString(), completedAt: new Date(Date.now() - 120000).toISOString(), duration: 180, attempts: 1, prUrl: "https://github.com/acme/frontend/pull/142" },
  { id: "j2", repository: "acme/backend", branch: "develop", commitSha: "e4f5g6h", status: "fixing", failureType: "build_error", confidence: 0.88, startedAt: new Date(Date.now() - 180000).toISOString(), completedAt: null, duration: null, attempts: 1, prUrl: null },
  { id: "j3", repository: "acme/api-gateway", branch: "main", commitSha: "i7j8k9l", status: "completed", failureType: "lint_error", confidence: 0.97, startedAt: new Date(Date.now() - 900000).toISOString(), completedAt: new Date(Date.now() - 780000).toISOString(), duration: 120, attempts: 1, prUrl: "https://github.com/acme/api-gateway/pull/87" },
  { id: "j4", repository: "acme/frontend", branch: "feat/auth", commitSha: "m0n1o2p", status: "failed", failureType: "type_error", confidence: 0.62, startedAt: new Date(Date.now() - 3600000).toISOString(), completedAt: new Date(Date.now() - 3200000).toISOString(), duration: 400, attempts: 3, prUrl: null },
  { id: "j5", repository: "acme/infra", branch: "main", commitSha: "q3r4s5t", status: "escalated", failureType: "config_error", confidence: 0.45, startedAt: new Date(Date.now() - 7200000).toISOString(), completedAt: new Date(Date.now() - 6800000).toISOString(), duration: 400, attempts: 3, prUrl: null },
  { id: "j6", repository: "acme/backend", branch: "main", commitSha: "u6v7w8x", status: "completed", failureType: "dependency_error", confidence: 0.91, startedAt: new Date(Date.now() - 14400000).toISOString(), completedAt: new Date(Date.now() - 14100000).toISOString(), duration: 300, attempts: 2, prUrl: "https://github.com/acme/backend/pull/203" },
  { id: "j7", repository: "acme/mobile-app", branch: "release/2.1", commitSha: "y9z0a1b", status: "analyzing", failureType: "test_failure", confidence: 0.82, startedAt: new Date(Date.now() - 60000).toISOString(), completedAt: null, duration: null, attempts: 1, prUrl: null },
];

const DEMO_REPOS: RepoHealth[] = [
  { id: "r1", name: "frontend", fullName: "acme/frontend", status: "healthy", lastFixAt: new Date(Date.now() - 300000).toISOString(), totalFixes: 42, successRate: 92.3, openIssues: 1 },
  { id: "r2", name: "backend", fullName: "acme/backend", status: "healthy", lastFixAt: new Date(Date.now() - 14400000).toISOString(), totalFixes: 67, successRate: 88.1, openIssues: 2 },
  { id: "r3", name: "api-gateway", fullName: "acme/api-gateway", status: "degraded", lastFixAt: new Date(Date.now() - 900000).toISOString(), totalFixes: 23, successRate: 73.9, openIssues: 3 },
  { id: "r4", name: "mobile-app", fullName: "acme/mobile-app", status: "healthy", lastFixAt: new Date(Date.now() - 86400000).toISOString(), totalFixes: 18, successRate: 83.3, openIssues: 0 },
  { id: "r5", name: "infra", fullName: "acme/infra", status: "failing", lastFixAt: new Date(Date.now() - 7200000).toISOString(), totalFixes: 8, successRate: 37.5, openIssues: 5 },
];

// ────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [recentJobs, setRecentJobs] = useState<RecentJob[] | null>(null);
  const [trendData, setTrendData] = useState<TrendDataPoint[] | null>(null);
  const [repoHealth, setRepoHealth] = useState<RepoHealth[] | null>(null);
  const [ciProviders, setCiProviders] = useState<CIProviderConfig[]>([]);
  const [scmProviders, setScmProviders] = useState<SCMProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [m, jobs, trends, ci, scm] = await Promise.all([
          fetchDashboardMetrics(),
          fetchRecentJobs(),
          fetchTrendData("30d"),
          isDemoMode() ? Promise.resolve(null) : fetchCiProviders(),
          isDemoMode() ? Promise.resolve(null) : fetchScmProviders(),
        ]);

        if (ci) setCiProviders(ci);
        if (scm) setScmProviders(scm);

        // Use API data if available; only fall back to demo data in demo mode
        const demo = isDemoMode();
        setMetrics(m ?? (demo ? DEMO_METRICS : null));
        setRecentJobs(jobs ?? (demo ? DEMO_JOBS : []));
        setTrendData(trends ?? (demo ? generateTrendData(30) : []));
        setRepoHealth(demo ? DEMO_REPOS : []);

        // Derive repo health from real jobs if available
        if (jobs && jobs.length > 0) {
          const repoMap = new Map<string, { total: number; success: number; lastAt: string | null }>();
          for (const job of jobs) {
            const entry = repoMap.get(job.repository) ?? { total: 0, success: 0, lastAt: null };
            entry.total++;
            if (job.status === "completed") entry.success++;
            if (!entry.lastAt || job.startedAt > entry.lastAt) entry.lastAt = job.startedAt;
            repoMap.set(job.repository, entry);
          }
          const derived: RepoHealth[] = [];
          for (const [name, data] of repoMap) {
            const rate = data.total > 0 ? (data.success / data.total) * 100 : 0;
            derived.push({
              id: name,
              name: name.split("/").pop() ?? name,
              fullName: name,
              status: rate >= 80 ? "healthy" : rate >= 50 ? "degraded" : "failing",
              lastFixAt: data.lastAt,
              totalFixes: data.success,
              successRate: rate,
              openIssues: data.total - data.success,
            });
          }
          setRepoHealth(derived);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  const handlePeriodChange = useCallback(async (period: "7d" | "30d" | "90d") => {
    const periodDays = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    setTrendData(null);
    const trends = await fetchTrendData(period);
    setTrendData(trends ?? (isDemoMode() ? generateTrendData(periodDays) : []));
  }, []);

  if (error) {
    return (
      <PageTransition className="p-6 md:p-8">
        <p className="text-red-400">Failed to load dashboard: {error}</p>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="min-w-0 space-y-8 p-6 md:p-10">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Overview of your autonomous repair pipeline
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground">
          <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
          Agent Active
        </div>
      </div>

      {/* Connected Providers */}
      {!loading && (ciProviders.length > 0 || scmProviders.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* CI Providers Card */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-violet-500/10 p-2">
                  <GitBranch className="size-4 text-violet-400" />
                </div>
                <h3 className="text-sm font-semibold">CI Providers</h3>
              </div>
              <Link
                href="/settings/ci-providers"
                className="rounded p-1 text-muted-foreground transition-all hover:text-foreground"
              >
                <Settings className="size-3.5" />
              </Link>
            </div>
            {ciProviders.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No CI providers connected.{" "}
                <Link href="/settings/ci-providers" className="text-brand-cyan hover:underline">
                  Add one
                </Link>
              </p>
            ) : (
              <div className="space-y-2">
                {ciProviders.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    {p.isActive ? (
                      <CheckCircle2 className="size-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="size-3.5 text-red-400" />
                    )}
                    <span className="text-sm">{p.displayName ?? p.providerType}</span>
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                      {p.providerType}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SCM Providers Card */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-brand-cyan/10 p-2">
                  <FolderGit2 className="size-4 text-brand-cyan" />
                </div>
                <h3 className="text-sm font-semibold">SCM Providers</h3>
              </div>
              <Link
                href="/settings/scm-providers"
                className="rounded p-1 text-muted-foreground transition-all hover:text-foreground"
              >
                <Settings className="size-3.5" />
              </Link>
            </div>
            {scmProviders.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No source code providers connected.{" "}
                <Link href="/settings/scm-providers" className="text-brand-cyan hover:underline">
                  Add one
                </Link>
              </p>
            ) : (
              <div className="space-y-2">
                {scmProviders.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    {p.isActive ? (
                      <CheckCircle2 className="size-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="size-3.5 text-red-400" />
                    )}
                    <span className="text-sm">{p.displayName ?? p.providerType}</span>
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                      {p.providerType}
                    </span>
                    {p.hasToken && (
                      <span className="text-[10px] text-emerald-400">Connected</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* No providers connected — prompt to set up */}
      {!loading && ciProviders.length === 0 && scmProviders.length === 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2">
              <Settings className="size-5 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-300">Get Started</p>
              <p className="text-xs text-muted-foreground">
                Connect your CI and source code providers to start monitoring pipelines.{" "}
                <Link href="/settings/ci-providers" className="text-brand-cyan hover:underline">
                  CI Providers
                </Link>
                {" | "}
                <Link href="/settings/scm-providers" className="text-brand-cyan hover:underline">
                  SCM Providers
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Metrics */}
      <MetricsGrid metrics={metrics} loading={loading} />

      {/* Trend Chart — full width */}
      <TrendChart
        data={trendData}
        loading={loading}
        onPeriodChange={handlePeriodChange}
      />

      {/* Repo Health + Recent Activity — side by side on large screens */}
      <div className="grid gap-8 xl:grid-cols-2">
        <RepoHealthGrid repos={repoHealth} loading={loading} />
        <RecentActivityFeed jobs={recentJobs} loading={loading} />
      </div>
    </PageTransition>
  );
}
