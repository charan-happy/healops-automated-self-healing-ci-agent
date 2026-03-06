"use client";

import { useEffect, useState } from "react";
import { Wrench, Loader2, CheckCircle2, XCircle, AlertTriangle, Clock, ArrowUpRight } from "lucide-react";
import PageTransition from "@/app/_components/PageTransition";
import { fetchRecentJobs } from "@/app/_libs/healops-api";
import type { RecentJob } from "@/app/_libs/types/dashboard";

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; label: string; className: string }> = {
  completed: { icon: CheckCircle2, label: "Completed", className: "text-emerald-400" },
  fixing: { icon: Loader2, label: "Fixing", className: "text-brand-cyan animate-spin" },
  analyzing: { icon: Clock, label: "Analyzing", className: "text-amber-400 animate-pulse" },
  failed: { icon: XCircle, label: "Failed", className: "text-red-400" },
  escalated: { icon: AlertTriangle, label: "Escalated", className: "text-orange-400" },
};

const DEMO_JOBS: RecentJob[] = [
  { id: "j1", repository: "acme/frontend", branch: "main", commitSha: "a1b2c3d", status: "completed", failureType: "test_failure", confidence: 0.94, startedAt: new Date(Date.now() - 300000).toISOString(), completedAt: new Date(Date.now() - 120000).toISOString(), duration: 180, attempts: 1, prUrl: "https://github.com/acme/frontend/pull/142" },
  { id: "j2", repository: "acme/backend", branch: "develop", commitSha: "e4f5g6h", status: "fixing", failureType: "build_error", confidence: 0.88, startedAt: new Date(Date.now() - 180000).toISOString(), completedAt: null, duration: null, attempts: 1, prUrl: null },
  { id: "j3", repository: "acme/api-gateway", branch: "main", commitSha: "i7j8k9l", status: "completed", failureType: "lint_error", confidence: 0.97, startedAt: new Date(Date.now() - 900000).toISOString(), completedAt: new Date(Date.now() - 780000).toISOString(), duration: 120, attempts: 1, prUrl: "https://github.com/acme/api-gateway/pull/87" },
  { id: "j4", repository: "acme/frontend", branch: "feat/auth", commitSha: "m0n1o2p", status: "failed", failureType: "type_error", confidence: 0.62, startedAt: new Date(Date.now() - 3600000).toISOString(), completedAt: new Date(Date.now() - 3200000).toISOString(), duration: 400, attempts: 3, prUrl: null },
  { id: "j5", repository: "acme/infra", branch: "main", commitSha: "q3r4s5t", status: "escalated", failureType: "config_error", confidence: 0.45, startedAt: new Date(Date.now() - 7200000).toISOString(), completedAt: new Date(Date.now() - 6800000).toISOString(), duration: 400, attempts: 3, prUrl: null },
  { id: "j6", repository: "acme/backend", branch: "main", commitSha: "u6v7w8x", status: "completed", failureType: "dependency_error", confidence: 0.91, startedAt: new Date(Date.now() - 14400000).toISOString(), completedAt: new Date(Date.now() - 14100000).toISOString(), duration: 300, attempts: 2, prUrl: "https://github.com/acme/backend/pull/203" },
  { id: "j7", repository: "acme/mobile-app", branch: "release/2.1", commitSha: "y9z0a1b", status: "analyzing", failureType: "test_failure", confidence: 0.82, startedAt: new Date(Date.now() - 60000).toISOString(), completedAt: null, duration: null, attempts: 1, prUrl: null },
];

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function RepairJobsPage() {
  const [jobs, setJobs] = useState<RecentJob[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    async function load() {
      const data = await fetchRecentJobs(50);
      setJobs(data ?? DEMO_JOBS);
      setLoading(false);
    }
    load();
  }, []);

  const filteredJobs = jobs?.filter(
    (j) => filter === "all" || j.status === filter,
  ) ?? [];

  const counts = jobs?.reduce(
    (acc, j) => {
      acc[j.status] = (acc[j.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  ) ?? {};

  return (
    <PageTransition className="space-y-6 p-6 md:p-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Repair Jobs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All autonomous repair jobs across your repositories
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: "all", label: "All", count: jobs?.length ?? 0 },
          { key: "completed", label: "Completed", count: counts["completed"] ?? 0 },
          { key: "fixing", label: "In Progress", count: (counts["fixing"] ?? 0) + (counts["analyzing"] ?? 0) },
          { key: "failed", label: "Failed", count: counts["failed"] ?? 0 },
          { key: "escalated", label: "Escalated", count: counts["escalated"] ?? 0 },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              filter === f.key
                ? "border-brand-cyan/50 bg-brand-cyan/10 text-brand-cyan"
                : "border-border/30 bg-card/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
            <span className="ml-1.5 opacity-60">{f.count}</span>
          </button>
        ))}
      </div>

      {/* Job list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-brand-cyan" />
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
          <Wrench className="size-10 opacity-40" />
          <p className="text-sm">No repair jobs found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredJobs.map((job) => {
            const config = STATUS_CONFIG[job.status] ?? STATUS_CONFIG["fixing"]!;
            const Icon = config.icon;
            return (
              <div
                key={job.id}
                className="flex items-center gap-4 rounded-xl border border-border/30 bg-card/60 p-4 transition-colors hover:bg-card/80"
              >
                <Icon className={`size-5 shrink-0 ${config.className}`} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {job.repository}
                    </span>
                    <span className="shrink-0 rounded bg-card/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                      {job.branch}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="capitalize">
                      {job.failureType?.replace(/_/g, " ") ?? "unknown"}
                    </span>
                    <span>{job.confidence ? `${Math.round(job.confidence * 100)}% confidence` : ""}</span>
                    <span>{formatDuration(job.duration)}</span>
                    <span>
                      {job.attempts > 1
                        ? `${job.attempts} attempts`
                        : "1 attempt"}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {timeAgo(job.startedAt)}
                  </span>
                  {job.prUrl && (
                    <a
                      href={job.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-md border border-border/30 px-2 py-1 text-xs text-brand-cyan transition-colors hover:bg-brand-cyan/10"
                    >
                      PR
                      <ArrowUpRight className="size-3" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageTransition>
  );
}
