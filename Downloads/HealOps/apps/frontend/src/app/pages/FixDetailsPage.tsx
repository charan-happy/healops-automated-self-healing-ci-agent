'use client';

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { GitCommit, Loader2, FileCode, Plus, Minus, User, Calendar, ExternalLink, Bot, Clock, CheckCircle2, XCircle, Wrench } from "lucide-react";
import PageTransition from "../_components/PageTransition";
import StatusBadge from "../_components/StatusBadge";
import { fetchCommitDetail } from "../_libs/github/github-service";
import type { CommitDetail } from "../_libs/github/github-service";
import { fetchPipelineStatus } from "../_libs/healops-api";
import type { PipelineStatusResponse, PipelineFailure } from "../_libs/healops-api";
import type { PipelineStatus } from "../_libs/mockData";
import { trackEvent, POSTHOG_EVENTS } from "../_libs/utils/analytics";
import { FixFeedbackWidget } from "../_components/FixFeedbackWidget";
import { AgentThinkingTimeline } from "../_components/agent/AgentThinkingTimeline";

const FixDetailsPage = () => {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const commitId = searchParams.get("commitId");

  const [owner, repo] = projectId ? projectId.split("--") : [null, null];

  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [pipelineData, setPipelineData] = useState<PipelineStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!owner || !repo || !commitId) {
      setLoading(false);
      return;
    }

    trackEvent(POSTHOG_EVENTS.FIX_DETAILS_VIEWED, { owner, repo, commitId });

    Promise.all([
      fetchCommitDetail(owner, repo, commitId),
      fetchPipelineStatus(commitId),
    ])
      .then(([commitDetail, status]) => {
        setDetail(commitDetail);
        setPipelineData(status);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [owner, repo, commitId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-brand-cyan" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto p-8">
        <p className="text-red-400">Failed to load commit: {error}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p className="text-sm">Commit not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <PageTransition className="max-w-5xl mx-auto p-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-primary/20 to-brand-cyan/20">
                <GitCommit size={20} className="text-brand-cyan" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold">
                  <span className="text-gradient">Commit Detail</span>
                </h1>
                <p className="text-base text-muted-foreground font-medium truncate">
                  <code className="text-brand-cyan font-bold bg-brand-cyan/10 px-1.5 py-0.5 rounded">{detail.sha.slice(0, 7)}</code>
                  <span className="ml-2">{detail.message.split("\n")[0]}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-4 mb-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <User size={14} />
              <span className="font-medium text-foreground">{detail.author}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar size={14} />
              {detail.date}
            </span>
            {detail.parents.length > 0 && (
              <span>
                Parent{detail.parents.length > 1 ? "s" : ""}:{" "}
                {detail.parents.map((p) => (
                  <code key={p} className="text-brand-cyan bg-brand-cyan/10 px-1 py-0.5 rounded text-xs font-bold mr-1">{p}</code>
                ))}
              </span>
            )}
            <a
              href={detail.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-brand-cyan hover:underline ml-auto"
            >
              View on GitHub <ExternalLink size={12} />
            </a>
          </div>

          {/* Full commit message if multiline */}
          {detail.message.includes("\n") && (
            <div className="mb-6 p-4 rounded-xl border border-border/50 bg-card/80">
              <pre className="text-sm text-foreground/80 whitespace-pre-wrap font-mono">{detail.message}</pre>
            </div>
          )}

          {/* Stats summary */}
          <div className="flex items-center gap-4 mb-6 text-sm">
            <span className="flex items-center gap-1.5">
              <FileCode size={14} className="text-muted-foreground" />
              <span className="font-bold text-foreground">{detail.files.length}</span>
              <span className="text-muted-foreground">file{detail.files.length !== 1 ? "s" : ""} changed</span>
            </span>
            <span className="flex items-center gap-1 text-green-400">
              <Plus size={14} />
              <span className="font-bold">{detail.stats.additions}</span>
            </span>
            <span className="flex items-center gap-1 text-red-400">
              <Minus size={14} />
              <span className="font-bold">{detail.stats.deletions}</span>
            </span>
          </div>

          {/* File diffs */}
          <div className="space-y-3">
            {detail.files.map((file) => (
              <div key={file.filename} className="rounded-xl border border-border/50 bg-card/80 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-card/60">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileStatusBadge status={file.status} />
                    <span className="text-sm font-mono font-medium truncate">{file.filename}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs shrink-0">
                    <span className="text-green-400 font-bold">+{file.additions}</span>
                    <span className="text-red-400 font-bold">-{file.deletions}</span>
                  </div>
                </div>
                {file.patch && (
                  <div className="overflow-x-auto">
                    <pre className="text-xs leading-5 font-mono p-3">
                      {file.patch.split("\n").map((line, idx) => (
                        <div
                          key={idx}
                          className={
                            line.startsWith("+") && !line.startsWith("+++")
                              ? "bg-green-500/10 text-green-400"
                              : line.startsWith("-") && !line.startsWith("---")
                                ? "bg-red-500/10 text-red-400"
                                : line.startsWith("@@")
                                  ? "text-brand-cyan/70"
                                  : "text-foreground/60"
                          }
                        >
                          {line}
                        </div>
                      ))}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Agent Activity Section — only show if agent created a fix branch */}
          {pipelineData && hasAgentActivity(pipelineData) && (
            <AgentActivitySection pipelineData={pipelineData} />
          )}
        </PageTransition>
      </div>
    </div>
  );
};

// ─── Agent Activity Section ──────────────────────────────────────────────────

function isAgentBranch(branch: string | null): boolean {
  if (!branch) return false;
  return branch.startsWith("agent-fix/") || branch.startsWith("healops/fix/");
}

function hasAgentActivity(data: PipelineStatusResponse): boolean {
  return data.pipelineRuns.some((run) => isAgentBranch(run.agentBranch));
}

function getJobPipelineStatus(status: string): PipelineStatus {
  switch (status) {
    case "success":
      return "fixed";
    case "running":
    case "queued":
      return "running";
    case "escalated":
    case "budget_exceeded":
    case "circular_fix_detected":
      return "escalated";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

const AgentActivitySection = ({ pipelineData }: { pipelineData: PipelineStatusResponse }) => {
  // Only consider runs where the agent created a fix branch
  const agentRuns = pipelineData.pipelineRuns.filter((run) => isAgentBranch(run.agentBranch));
  const failuresWithJobs = agentRuns.flatMap((run) => run.failures).filter((f) => f.job !== null);

  const totalAttempts = failuresWithJobs.reduce(
    (n, f) => n + (f.job?.attempts.length ?? 0),
    0,
  );
  const successJobs = failuresWithJobs.filter((f) => f.job?.status === "success").length;
  const failedJobs = failuresWithJobs.filter(
    (f) => f.job?.status === "failed" || f.job?.status === "escalated",
  ).length;

  return (
    <div className="mt-8 pt-8 border-t border-border/50">
      {/* Section header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Bot size={20} className="text-brand-cyan" />
          <span className="text-gradient">Agent Activity</span>
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          <span className="font-bold text-foreground">{failuresWithJobs.length}</span> failure{failuresWithJobs.length !== 1 ? "s" : ""} detected
          {" · "}
          <span className="font-bold text-foreground">{totalAttempts}</span> attempt{totalAttempts !== 1 ? "s" : ""}
          {successJobs > 0 && (
            <>
              {" · "}
              <span className="font-bold text-green-400">{successJobs}</span> fixed
            </>
          )}
          {failedJobs > 0 && (
            <>
              {" · "}
              <span className="font-bold text-red-400">{failedJobs}</span> failed
            </>
          )}
        </p>
      </div>

      {/* Pipeline run info */}
      {agentRuns.map((run) => (
        <div key={run.id} className="mb-4">
          <div className="flex items-center gap-3 mb-3 text-sm">
            <StatusBadge status={run.status === "success" ? "success" : run.status === "failed" ? "failed" : "running"} />
            <span className="text-muted-foreground">
              {run.workflowName && <span className="font-medium text-foreground">{run.workflowName}</span>}
              {run.logUrl && (
                <a href={run.logUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-brand-cyan hover:underline inline-flex items-center gap-1">
                  View logs <ExternalLink size={10} />
                </a>
              )}
            </span>
            {run.agentBranch && (
              <code className="text-xs bg-brand-cyan/10 text-brand-cyan px-1.5 py-0.5 rounded font-bold">{run.agentBranch}</code>
            )}
          </div>
        </div>
      ))}

      {/* Failure cards */}
      <div className="space-y-4">
        {failuresWithJobs.map((failure) => (
          <FailureCard key={failure.id} failure={failure} />
        ))}
      </div>
    </div>
  );
};

const FailureCard = ({ failure }: { failure: PipelineFailure }) => {
  const job = failure.job!;
  const jobStatus = getJobPipelineStatus(job.status);

  return (
    <div className="rounded-xl border border-border/50 bg-card/80 overflow-hidden">
      {/* Failure header */}
      <div className="px-4 py-3 border-b border-border/40 bg-card/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <StatusBadge status={jobStatus} size="sm" />
            <span className="text-sm font-semibold truncate">{failure.errorSummary}</span>
          </div>
          {job.confidence !== null && (
            <span className="text-xs text-muted-foreground shrink-0">
              Confidence: <span className="font-bold text-foreground">{Math.round(job.confidence * 100)}%</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
          {failure.affectedFile && (
            <span className="flex items-center gap-1">
              <FileCode size={11} />
              <code className="font-medium">{failure.affectedFile}{failure.affectedLine ? `:${failure.affectedLine}` : ""}</code>
            </span>
          )}
          {job.classifiedFailureType && (
            <span className="bg-muted/50 px-1.5 py-0.5 rounded font-medium">{job.classifiedFailureType}</span>
          )}
          <span>{failure.language}</span>
        </div>
      </div>

      {/* Attempts */}
      <div className="px-4 py-3 space-y-2">
        {job.attempts.map((attempt) => {
          const hasValidation = attempt.validations.length > 0;
          const buildPassed = attempt.validations.some((v) => v.buildStatus === "success");
          const icon = buildPassed
            ? <CheckCircle2 size={14} className="text-green-400" />
            : hasValidation
              ? <XCircle size={14} className="text-red-400" />
              : <Wrench size={14} className="text-brand-cyan" />;

          return (
            <div key={attempt.attemptNumber}>
              <div className="flex items-center justify-between py-1.5 text-sm">
                <div className="flex items-center gap-2">
                  {icon}
                  <span className="font-medium">Attempt #{attempt.attemptNumber}</span>
                  {attempt.patch && (
                    <span className="text-xs text-muted-foreground">
                      {attempt.patch.patchSize} bytes patched
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {attempt.validations.map((v) => (
                    <span key={v.stage} className="flex items-center gap-1">
                      {v.buildStatus === "success" ? (
                        <CheckCircle2 size={10} className="text-green-400" />
                      ) : (
                        <XCircle size={10} className="text-red-400" />
                      )}
                      {v.stage}
                    </span>
                  ))}
                  {attempt.latencyMs !== null && (
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {attempt.latencyMs < 1000
                        ? `${attempt.latencyMs}ms`
                        : `${(attempt.latencyMs / 1000).toFixed(1)}s`}
                    </span>
                  )}
                  <span>{attempt.inputTokens + attempt.outputTokens} tokens</span>
                </div>
              </div>
              <AgentThinkingTimeline steps={attempt.steps} />
            </div>
          );
        })}
      </div>

      {/* PR link */}
      {job.pullRequest && (
        <div className="px-4 py-2.5 border-t border-border/40 bg-card/60">
          <a
            href={job.pullRequest.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent(POSTHOG_EVENTS.FIX_PR_CLICKED, { prUrl: job.pullRequest?.prUrl, status: job.pullRequest?.status })}
            className="inline-flex items-center gap-1.5 text-sm text-brand-cyan hover:underline font-bold"
          >
            <ExternalLink size={14} />
            View Pull Request
            <span className="text-xs font-normal text-muted-foreground">
              ({job.pullRequest.sourceBranch} → {job.pullRequest.targetBranch})
            </span>
            {job.pullRequest.isDraft && (
              <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded font-bold ml-1">Draft</span>
            )}
          </a>
        </div>
      )}

      {/* Feedback widget — show when agent has produced a result */}
      {(job.status === "success" || job.pullRequest) && (
        <div className="px-4 py-3 border-t border-border/40">
          <FixFeedbackWidget jobId={job.id} failureId={failure.id} />
        </div>
      )}
    </div>
  );
};

const FileStatusBadge = ({ status }: { status: string }) => {
  const config: Record<string, { label: string; className: string }> = {
    added: { label: "A", className: "bg-green-500/20 text-green-400" },
    removed: { label: "D", className: "bg-red-500/20 text-red-400" },
    modified: { label: "M", className: "bg-yellow-500/20 text-yellow-400" },
    renamed: { label: "R", className: "bg-blue-500/20 text-blue-400" },
    copied: { label: "C", className: "bg-purple-500/20 text-purple-400" },
  };
  const c = config[status] ?? { label: status[0]?.toUpperCase() ?? "?", className: "bg-muted text-muted-foreground" };

  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold shrink-0 ${c.className}`}>
      {c.label}
    </span>
  );
};

export default FixDetailsPage;
