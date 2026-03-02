"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowUpRight,
  Search,
  XCircle,
} from "lucide-react";
import type { RecentJob } from "@/app/_libs/types/dashboard";

interface RecentActivityFeedProps {
  jobs: RecentJob[] | null;
  loading?: boolean;
}

const statusConfig: Record<
  string,
  { icon: typeof Clock; color: string; label: string }
> = {
  pending: { icon: Clock, color: "text-yellow-400", label: "Pending" },
  analyzing: { icon: Search, color: "text-blue-400", label: "Analyzing" },
  fixing: { icon: Loader2, color: "text-brand-cyan", label: "Fixing" },
  validating: { icon: Loader2, color: "text-purple-400", label: "Validating" },
  completed: {
    icon: CheckCircle2,
    color: "text-emerald-400",
    label: "Fixed",
  },
  failed: { icon: XCircle, color: "text-red-400", label: "Failed" },
  escalated: {
    icon: AlertTriangle,
    color: "text-orange-400",
    label: "Escalated",
  },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function RecentActivityFeed({
  jobs,
  loading,
}: RecentActivityFeedProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Recent Activity</h3>
          <p className="text-sm text-muted-foreground">Latest repair jobs</p>
        </div>
      </div>

      {loading || !jobs ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg bg-white/5"
            />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <CheckCircle2 className="mb-3 size-10 text-emerald-400/50" />
          <p className="text-sm">No repair jobs yet</p>
          <p className="text-xs">
            Jobs will appear here when pipeline failures are detected
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {jobs.map((job) => {
              const config = statusConfig[job.status] ?? statusConfig.pending;
              const StatusIcon = config.icon;

              return (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="group flex items-center gap-4 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3 transition-all hover:border-white/10 hover:bg-white/[0.04]"
                >
                  <StatusIcon
                    className={`size-4 shrink-0 ${config.color} ${
                      job.status === "fixing" || job.status === "validating"
                        ? "animate-spin"
                        : ""
                    }`}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {job.repository}
                      </span>
                      <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {job.failureType}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{job.branch}</span>
                      <span>·</span>
                      <span>{timeAgo(job.startedAt)}</span>
                      {job.attempts > 1 && (
                        <>
                          <span>·</span>
                          <span>Attempt {job.attempts}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <span
                    className={`shrink-0 text-xs font-medium ${config.color}`}
                  >
                    {config.label}
                  </span>

                  {job.prUrl && (
                    <a
                      href={job.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-white/10 group-hover:opacity-100"
                    >
                      <ArrowUpRight className="size-3.5 text-brand-cyan" />
                    </a>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
