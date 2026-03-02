"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileSearch,
  Database,
  Sparkles,
  Shield,
  Code,
  GitBranch,
  GitPullRequest,
  Tag,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ChevronDown,
  ChevronRight,
  Brain,
} from "lucide-react";
import type { AgentStep } from "@/app/_libs/healops-api";

const STAGE_ICONS: Record<string, React.ElementType> = {
  gatherContext: FileSearch,
  classify: Tag,
  searchSimilar: Database,
  generateFix: Sparkles,
  qualityGate: Shield,
  preCheck: Code,
  pushBranch: GitBranch,
  createPR: GitPullRequest,
};

const STAGE_COLORS: Record<string, string> = {
  gatherContext: "text-blue-400",
  classify: "text-purple-400",
  searchSimilar: "text-cyan-400",
  generateFix: "text-amber-400",
  qualityGate: "text-emerald-400",
  preCheck: "text-orange-400",
  pushBranch: "text-teal-400",
  createPR: "text-green-400",
};

function StatusIcon({ status }: { status: AgentStep["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="size-4 text-emerald-400" />;
    case "failed":
      return <XCircle className="size-4 text-red-400" />;
    case "running":
      return <Loader2 className="size-4 animate-spin text-brand-cyan" />;
    case "skipped":
      return <Clock className="size-4 text-muted-foreground/50" />;
    default:
      return <Clock className="size-4 text-muted-foreground/30" />;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

interface AgentThinkingTimelineProps {
  steps?: AgentStep[];
  defaultExpanded?: boolean;
}

export function AgentThinkingTimeline({
  steps,
  defaultExpanded = false,
}: AgentThinkingTimelineProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!steps || steps.length === 0) return null;

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const hasRunning = steps.some((s) => s.status === "running");
  const hasFailed = steps.some((s) => s.status === "failed");

  return (
    <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Brain className="size-3.5 text-brand-cyan" />
        <span>Agent Thinking</span>
        <span className="ml-1 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] tabular-nums">
          {completedCount}/{steps.length}
        </span>
        {hasRunning && (
          <Loader2 className="size-3 animate-spin text-brand-cyan" />
        )}
        {hasFailed && <XCircle className="size-3 text-red-400" />}
        <span className="ml-auto">
          {expanded ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-0.5 px-4 pb-3">
              {steps.map((step, i) => {
                const Icon = STAGE_ICONS[step.stage] ?? Brain;
                const colorClass =
                  STAGE_COLORS[step.stage] ?? "text-muted-foreground";

                return (
                  <motion.div
                    key={`${step.stage}-${i}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 py-1.5"
                  >
                    {/* Vertical line connector */}
                    <div className="relative flex flex-col items-center">
                      <div
                        className={`flex size-6 items-center justify-center rounded-md border ${
                          step.status === "running"
                            ? "border-brand-cyan/40 bg-brand-cyan/10"
                            : step.status === "completed"
                              ? "border-emerald-500/30 bg-emerald-500/10"
                              : step.status === "failed"
                                ? "border-red-500/30 bg-red-500/10"
                                : "border-white/[0.06] bg-white/[0.02]"
                        }`}
                      >
                        <Icon
                          className={`size-3 ${
                            step.status === "pending"
                              ? "text-muted-foreground/30"
                              : colorClass
                          }`}
                        />
                      </div>
                      {i < steps.length - 1 && (
                        <div className="absolute top-6 h-3 w-px bg-white/[0.06]" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex flex-1 items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-medium ${
                            step.status === "pending"
                              ? "text-muted-foreground/40"
                              : "text-foreground"
                          }`}
                        >
                          {step.displayName}
                        </span>
                        {step.details && step.status !== "pending" && (
                          <span className="max-w-[200px] truncate text-[10px] text-muted-foreground">
                            {step.details}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {step.durationMs != null && step.status !== "pending" && (
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            {formatDuration(step.durationMs)}
                          </span>
                        )}
                        <StatusIcon status={step.status} />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
