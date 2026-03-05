import type { Commit } from "@/libs/mockData";
import StatusBadge from "./StatusBadge";
import { GitCommit, Bot, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

interface CommitTimelineProps {
  commits: Commit[];
  selectedCommitId: string | null;
  onSelectCommit: (id: string) => void;
}

const CommitTimeline = ({ commits, selectedCommitId, onSelectCommit }: CommitTimelineProps) => {
  if (commits.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-primary/15 to-brand-cyan/15 flex items-center justify-center mb-4">
          <GitCommit size={28} className="text-brand-cyan animate-pulse" />
        </div>
        <p className="text-base font-semibold text-foreground">No commits found</p>
        <p className="text-sm text-muted-foreground mt-1">Commits for this branch will appear here</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-[19px] top-6 bottom-6 w-px bg-border" />

      <div className="space-y-2">
        {commits.map((commit, i) => {
          const isSelected = commit.id === selectedCommitId;
          return (
            <motion.button
              key={commit.id}
              onClick={() => onSelectCommit(commit.id)}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.07 }}
              className={`w-full text-left pl-10 pr-4 py-3 rounded-xl border transition-all duration-300 relative ${
                isSelected
                  ? "bg-brand-cyan/10 border-transparent animated-border glow-primary"
                  : "bg-card/80 backdrop-blur-sm border-border/50 hover:border-brand-cyan/20 hover:shadow-lg hover:shadow-brand-cyan/10 hover:-translate-y-0.5"
              }`}
            >
              {/* Timeline dot */}
              <div className={`absolute left-[14px] top-1/2 -translate-y-1/2 w-[11px] h-[11px] rounded-full border-2 z-10 ${
                commit.pipelineStatus === "success" || commit.pipelineStatus === "fixed"
                  ? "border-status-success bg-status-success/30"
                  : commit.pipelineStatus === "failed"
                  ? "border-status-error bg-status-error/30"
                  : commit.pipelineStatus === "running"
                  ? "border-status-running bg-status-running/30"
                  : "border-status-pending bg-status-pending/30"
              }`} />

              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-sm text-brand-cyan font-bold bg-brand-cyan/10 px-1.5 py-0.5 rounded">{commit.sha}</code>
                    <StatusBadge status={commit.pipelineStatus} />
                  </div>
                  <p className="text-base font-semibold truncate text-foreground">{commit.message}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-sm text-muted-foreground">
                    <span>{commit.author}</span>
                    <span>{commit.timestamp}</span>
                    {commit.agentFixCount > 0 && (
                      <span className="flex items-center gap-1 text-brand-cyan font-bold">
                        <Bot size={12} />
                        {commit.agentFixCount} fix{commit.agentFixCount > 1 ? "es" : ""}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight size={16} className={`mt-1 shrink-0 transition-colors ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default CommitTimeline;
