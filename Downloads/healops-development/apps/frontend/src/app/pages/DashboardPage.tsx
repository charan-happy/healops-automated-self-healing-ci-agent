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
} from "../_libs/healops-api";
import type { DashboardMetrics, RecentJob, TrendDataPoint, RepoHealth } from "../_libs/types/dashboard";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [m, jobs, trends] = await Promise.all([
          fetchDashboardMetrics(),
          fetchRecentJobs(),
          fetchTrendData("30d"),
        ]);

        // Use API data if available, otherwise fall back to demo data
        setMetrics(m ?? DEMO_METRICS);
        setRecentJobs(jobs ?? DEMO_JOBS);
        setTrendData(trends ?? generateTrendData(30));
        setRepoHealth(DEMO_REPOS);

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
    setTrendData(trends ?? generateTrendData(periodDays));
  }, []);

  if (error) {
    return (
      <PageTransition className="p-6 md:p-8">
        <p className="text-red-400">Failed to load dashboard: {error}</p>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your autonomous repair pipeline
        </p>
      </div>

      <MetricsGrid metrics={metrics} loading={loading} />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <TrendChart
            data={trendData}
            loading={loading}
            onPeriodChange={handlePeriodChange}
          />
        </div>
        <div className="lg:col-span-2">
          <RepoHealthGrid repos={repoHealth} loading={loading} />
        </div>
      </div>

      <RecentActivityFeed jobs={recentJobs} loading={loading} />
    </PageTransition>
  );
}
