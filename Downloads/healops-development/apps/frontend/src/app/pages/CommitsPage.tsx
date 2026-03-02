'use client';

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import CommitTimeline from "../_components/CommitTimeline";
import { GitCommit, Loader2, Search } from "lucide-react";
import PageTransition from "../_components/PageTransition";
import { fetchCommits } from "../_libs/github/github-service";
import { fetchPipelineStatus } from "../_libs/healops-api";
import { mockCommits } from "../_libs/mockData";
import type { Commit, PipelineStatus } from "../_libs/mockData";

// ─── Module-level cache (survives component re-mounts) ──────────────────────
const commitsCache = new Map<string, Commit[]>();

function hasAgentBranch(agentBranch: string | null): boolean {
  if (!agentBranch) return false;
  return agentBranch.startsWith("agent-fix/") || agentBranch.startsWith("healops/fix/");
}

async function enrichCommitsWithPipelineStatus(commitList: Commit[]): Promise<Commit[]> {
  return Promise.all(
    commitList.map(async (commit) => {
      const status = await fetchPipelineStatus(commit.id).catch(() => null);
      if (!status) return commit;

      const runs = status.pipelineRuns ?? [];
      const latestRun = runs[0];
      let pipelineStatus: PipelineStatus = "pending";
      let agentFixCount = 0;

      if (latestRun) {
        const runStatus = latestRun.status;
        const agentActed = hasAgentBranch(latestRun.agentBranch);

        if (runStatus === "success") {
          pipelineStatus = "success";
        } else if (runStatus === "failed" && agentActed) {
          const hasSuccessJob = latestRun.failures.some(
            (f) => f.job?.status === "success",
          );
          const hasEscalated = latestRun.failures.some(
            (f) => f.job?.status === "escalated",
          );
          const hasRunning = latestRun.failures.some(
            (f) => f.job?.status === "running" || f.job?.status === "queued",
          );

          if (hasSuccessJob) {
            pipelineStatus = "fixed";
          } else if (hasEscalated) {
            pipelineStatus = "escalated";
          } else if (hasRunning) {
            pipelineStatus = "running";
          } else {
            pipelineStatus = "failed";
          }

          agentFixCount = latestRun.failures.reduce(
            (count, f) => count + (f.job?.attempts.length ?? 0),
            0,
          );
        } else if (runStatus === "failed") {
          pipelineStatus = "failed";
        }
      }

      return { ...commit, pipelineStatus, agentFixCount };
    }),
  );
}

const CommitsPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const branchId = searchParams.get("branchId");

  const [owner, repo] = projectId?.includes("--") ? projectId.split("--") : [null, null];

  const cacheKey = `${projectId}:${branchId}`;
  const cached = commitsCache.get(cacheKey);

  const [commits, setCommits] = useState<Commit[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const cacheKeyRef = useRef(cacheKey);

  useEffect(() => {
    cacheKeyRef.current = cacheKey;

    if (!owner || !repo || !branchId) {
      // Demo mode — show mock commits for the branch
      if (branchId && mockCommits[branchId]) {
        setCommits(mockCommits[branchId]);
      }
      setLoading(false);
      return;
    }

    // If we have cached data, show it immediately — no loading spinner
    if (cached) {
      setCommits(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;

    fetchCommits(owner, repo, branchId)
      .then((commitList) => enrichCommitsWithPipelineStatus(commitList))
      .then((enriched) => {
        if (!cancelled) {
          commitsCache.set(cacheKeyRef.current, enriched);
          setCommits(enriched);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Fallback to demo commits
          if (branchId && mockCommits[branchId]) {
            setCommits(mockCommits[branchId]);
          }
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [owner, repo, branchId, cacheKey, cached]);

  const filtered = useMemo(() => {
    if (!search.trim()) return commits;
    const q = search.toLowerCase();
    return commits.filter(
      (c) =>
        c.sha.toLowerCase().includes(q) ||
        c.message.toLowerCase().includes(q) ||
        c.author.toLowerCase().includes(q),
    );
  }, [commits, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-brand-cyan" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <p className="text-red-400">Failed to load commits: {error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <PageTransition className="max-w-4xl mx-auto p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-primary/15 to-brand-cyan/15">
                <GitCommit size={20} className="text-brand-cyan" />
              </div>
              <span className="text-gradient">Commits</span>
            </h1>
            <p className="text-base text-muted-foreground mt-1 font-medium">User commits with pipeline status</p>
          </div>

          <div className="relative mb-5">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by SHA, message, or author..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-cyan/40 focus:ring-1 focus:ring-brand-cyan/20 transition-all"
            />
          </div>

          <CommitTimeline
            commits={filtered}
            selectedCommitId={null}
            onSelectCommit={(id) =>
              projectId && branchId
                ? router.push(
                    `/fix-details?projectId=${projectId}&branchId=${branchId}&commitId=${id}`,
                  )
                : undefined
            }
          />
        </PageTransition>
      </div>
    </div>
  );
};

export default CommitsPage;
