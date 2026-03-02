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
    <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Repository Health</h3>
        <p className="text-sm text-muted-foreground">
          Status of monitored repositories
        </p>
      </div>

      {loading || !repos ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg bg-white/5"
            />
          ))}
        </div>
      ) : repos.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No repositories connected yet
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {repos.map((repo, i) => {
            const st = statusIcons[repo.status];
            const StatusIcon = st.icon;

            return (
              <motion.div
                key={repo.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  href={`/projects?highlight=${repo.fullName}`}
                  className="block rounded-lg border border-white/5 bg-white/[0.02] p-4 transition-all hover:border-white/10 hover:bg-white/[0.04]"
                >
                  <div className="flex items-center gap-3">
                    <div className={`rounded-md p-1.5 ${st.bg}`}>
                      <StatusIcon className={`size-3.5 ${st.color}`} />
                    </div>
                    <span className="truncate text-sm font-medium">
                      {repo.name}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{repo.successRate.toFixed(0)}% success</span>
                    <span>{repo.totalFixes} fixes</span>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
