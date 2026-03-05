import type { AgentFix } from "@/libs/mockData";
import StatusBadge from "./StatusBadge";
import { Bot, Clock, FileCode, ExternalLink, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

interface FixDetailPanelProps {
  fixes: AgentFix[];
  commitSha: string;
}

const MAX_RETRIES = 3;

const CodeBlock = ({ code, variant }: { code: string; variant: "original" | "fixed" }) => {
  const bg = variant === "original" ? "bg-status-error/5 border-status-error/20" : "bg-status-success/5 border-status-success/20";
  const label = variant === "original" ? "Original" : "Fixed";
  const labelColor = variant === "original" ? "text-status-error" : "text-status-success";

  return (
    <div className={`rounded-md border ${bg} overflow-hidden`}>
      <div className={`px-3 py-1.5 border-b ${bg} flex items-center gap-1.5`}>
        <span className={`text-sm font-medium ${labelColor}`}>{label}</span>
      </div>
      <pre className="p-3 text-sm leading-relaxed overflow-x-auto text-foreground/90 tabular-nums">
        <code>{code}</code>
      </pre>
    </div>
  );
};

const FixCard = ({ fix }: { fix: AgentFix }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      className={`rounded-xl border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-cyan/10 ${
        fix.status === "success"
          ? "border-brand-cyan/25 glow-success"
          : fix.status === "running"
          ? "border-brand-primary/25"
          : "border-border/50"
      } bg-card/80 backdrop-blur-sm`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Bot size={18} className="text-brand-cyan" />
            <span className="text-base font-bold">Attempt #{fix.attempt}</span>
            <StatusBadge status={fix.status} />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock size={12} />
              {fix.duration}
            </span>
            {expanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
          </div>
        </div>

        <p className="text-sm text-muted-foreground font-medium">{fix.timestamp}</p>

        <div className="mt-2 flex items-center gap-1.5 text-sm">
          <FileCode size={12} className="text-muted-foreground" />
          <code className="font-semibold text-foreground/80 bg-muted/50 px-1.5 py-0.5 rounded">{fix.filePath}</code>
        </div>
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
            <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-status-error mb-1.5">Error</p>
                <pre className="bg-status-error/5 border border-status-error/20 rounded-md p-3 text-sm leading-relaxed overflow-x-auto text-foreground/90 tabular-nums">
                  {fix.error}
                </pre>
              </div>

              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-action-success mb-1.5">Fix Applied</p>
                <p className="text-base text-foreground/80">{fix.fix}</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                <CodeBlock code={fix.originalCode} variant="original" />
                <CodeBlock code={fix.fixedCode} variant="fixed" />
              </div>

              {fix.prUrl && (
                <a
                  href={fix.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-brand-cyan hover:underline font-bold"
                >
                  <ExternalLink size={14} />
                  View Pull Request
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const FixDetailPanel = ({ fixes, commitSha }: FixDetailPanelProps) => {
  if (fixes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-action-success/15 to-brand-cyan/15 flex items-center justify-center mb-4">
          <Bot size={28} className="text-action-success animate-pulse" />
        </div>
        <p className="text-base font-semibold text-foreground">No agent activity for this commit</p>
        <p className="text-sm text-muted-foreground mt-1">Pipeline passed without intervention — no fixes needed</p>
      </div>
    );
  }

  const successCount = fixes.filter((f) => f.status === "success").length;
  const failedCount = fixes.filter((f) => f.status === "failed").length;
  const isEscalated = failedCount >= MAX_RETRIES && successCount === 0;

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold flex items-center gap-2">
            <Bot size={18} className="text-brand-cyan" />
            Agent Activity
            <code className="text-sm font-bold text-brand-cyan bg-brand-cyan/10 px-1.5 py-0.5 rounded">{commitSha}</code>
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            <span className="font-bold text-foreground">{fixes.length}</span> attempt{fixes.length > 1 ? "s" : ""} · <span className="font-bold text-action-success">{successCount}</span> passed · <span className="font-bold text-action-danger">{failedCount}</span> failed
          </p>
        </div>
      </div>

      {/* Escalated banner */}
      {isEscalated && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-lg border border-status-warning/30 bg-status-warning/5 p-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-status-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-base font-bold text-status-warning">Escalated — Manual Intervention Required</p>
              <p className="text-sm text-muted-foreground mt-1">
                All {MAX_RETRIES} automated fix attempts have failed. The agent was unable to resolve the pipeline
                error. Please review the error details below and apply a manual fix.
              </p>
              <div className="mt-2 text-sm text-muted-foreground">
                <p>• Last error: <code className="text-foreground/90 font-bold bg-status-error/10 px-1 rounded">{fixes[fixes.length - 1]?.error.split("\n")[0]}</code></p>
                <p>• Total time spent: {fixes.map(f => f.duration).join(" → ")}</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Fix cards */}
      <div className="space-y-2">
        {fixes.map((fix, i) => (
          <motion.div
            key={fix.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <FixCard fix={fix} />
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default FixDetailPanel;
