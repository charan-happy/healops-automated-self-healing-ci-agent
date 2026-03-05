"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { RepoHealth } from "@/app/_libs/types/dashboard";

interface RepoHealthGridProps {
  repos: RepoHealth[] | null;
  loading?: boolean;
}

const statusIcons = {
  healthy: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-400/10" },
  degraded: { icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-400/10" },
  failing: { icon: XCircle, color: "text-red-400", bg: "bg-red-400/10" },
} as const;

export function RepoHealthGrid({ repos, loading }: RepoHealthGridProps) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-card/50 p-6 backdrop-blur-xl transition-all hover:border-white/[0.12]">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Repository Health</h3>
        <p className="text-sm text-muted-foreground">
          Status of monitored repositories
        </p>
      </div>

      {loading || !repos ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg bg-white/5"
            />
          ))}
        </div>
      ) : repos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <CheckCircle2 className="mb-3 size-10 text-emerald-400/50" />
          <p className="text-sm">No repositories connected yet</p>
          <p className="text-xs">Connect repos in Settings to start monitoring</p>
        </div>
      ) : (
        <div className="space-y-2">
          {repos.map((repo, i) => {
            const st = statusIcons[repo.status];
            const StatusIcon = st.icon;

            return (
              <motion.div
                key={repo.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  href={`/projects?highlight=${repo.fullName}`}
                  className="group flex items-center gap-4 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3 transition-all hover:border-white/10 hover:bg-white/[0.04]"
                >
                  <div className={`rounded-md p-1.5 ${st.bg}`}>
                    <StatusIcon className={`size-4 ${st.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{repo.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {repo.totalFixes} fixes · {repo.successRate.toFixed(0)}% success
                    </p>
                  </div>
                  {repo.openIssues > 0 && (
                    <span className="shrink-0 rounded-full bg-red-400/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
                      {repo.openIssues} open
                    </span>
                  )}
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
