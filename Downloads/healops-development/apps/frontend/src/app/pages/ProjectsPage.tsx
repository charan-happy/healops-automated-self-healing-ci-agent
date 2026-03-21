'use client';

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  FolderGit2, GitBranch, GitCommit, ArrowRight, Loader2, Search, ChevronDown,
  User, Plus, X, CheckCircle2, XCircle, Clock, Circle, ExternalLink, Timer,
  Activity, Link2, Trash2, Pencil, Save, AlertTriangle, MessageSquare, Filter, Bot,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PageTransition from "../_components/PageTransition";
import {
  fetchProjectsList, fetchProjectBranches, fetchProjectPipelines,
  fetchCiProviders, fetchScmProviders, fetchAvailableRepos,
  fetchScmAvailableRepos, addRepositoriesToOrg, isDemoMode,
  fetchRepoCiLinks, addRepoCiLink, updateRepoCiLink, removeRepoCiLink,
  fetchCiProviderJobs,
} from "../_libs/healops-api";
import type {
  ProjectResponse, BranchResponse, ProviderPipelineRun,
  AvailableRepo, ScmAvailableRepo, RepoCiLink, ProviderJob,
} from "../_libs/healops-api";
import { mockProjects, mockBranches } from "../_libs/mockData";
import type { Project, Branch } from "../_libs/mockData";
import { trackEvent, POSTHOG_EVENTS } from "../_libs/utils/analytics";

// ─── Provider badge config ──────────────────────────────────────────────────

const PROVIDER_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  github:    { label: "GitHub",    color: "text-foreground",    bg: "bg-foreground/10" },
  gitlab:    { label: "GitLab",    color: "text-orange-400", bg: "bg-orange-400/10" },
  bitbucket: { label: "Bitbucket", color: "text-blue-400",   bg: "bg-blue-400/10" },
  jenkins:   { label: "Jenkins",   color: "text-red-400",    bg: "bg-red-400/10" },
};

// ─── Pipeline status config ─────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  success:   { icon: CheckCircle2, color: "text-emerald-400", label: "Success" },
  failed:    { icon: XCircle,      color: "text-red-400",     label: "Failed" },
  running:   { icon: Loader2,      color: "text-amber-400",   label: "Running" },
  cancelled: { icon: XCircle,      color: "text-muted-foreground", label: "Cancelled" },
  pending:   { icon: Clock,        color: "text-amber-300",   label: "Pending" },
  unknown:   { icon: Circle,       color: "text-muted-foreground", label: "Unknown" },
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Demo data ──────────────────────────────────────────────────────────────

const DEMO_PROJECTS: Project[] = [
  ...mockProjects,
  { id: "5", name: "healops-agent", repo: "healops/agent", branchCount: 6, lastActivity: "5 min ago" },
  { id: "6", name: "infra-config", repo: "healops/infra-config", branchCount: 4, lastActivity: "30 min ago" },
];

const DEMO_BRANCHES: Record<string, Branch[]> = {
  ...mockBranches,
  "5": [
    { id: "b9", name: "main", author: "nagacharan", commitCount: 42, lastCommit: "5 min ago", pipelineStatus: "success" },
    { id: "b10", name: "feature/fallback-chain", author: "nagacharan", commitCount: 8, lastCommit: "2 hours ago", pipelineStatus: "fixed" },
    { id: "b11", name: "fix/circuit-breaker", author: "aditya", commitCount: 3, lastCommit: "1 day ago", pipelineStatus: "failed" },
  ],
  "6": [
    { id: "b12", name: "main", author: "devops-bot", commitCount: 120, lastCommit: "30 min ago", pipelineStatus: "success" },
    { id: "b13", name: "feature/multi-region", author: "mithun", commitCount: 15, lastCommit: "4 hours ago", pipelineStatus: "running" },
  ],
};

// ─── Add Repository Modal ───────────────────────────────────────────────────

type ProviderOption = { id: string; type: "ci" | "scm"; provider: string; displayName: string };
type RepoOption = { externalRepoId: string; name: string; defaultBranch: string };

function AddRepoModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [step, setStep] = useState<"provider" | "repos">("provider");
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<ProviderOption | null>(null);
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [repoSearch, setRepoSearch] = useState("");
  const [adding, setAdding] = useState(false);

  // Load providers on open
  useEffect(() => {
    if (!open) return;
    setStep("provider");
    setSelectedProvider(null);
    setRepos([]);
    setSelected(new Set());
    setLoadingProviders(true);

    Promise.all([fetchCiProviders(), fetchScmProviders()])
      .then(([ci, scm]) => {
        const opts: ProviderOption[] = [];
        if (ci) {
          for (const c of ci) {
            if (c.isActive) {
              opts.push({
                id: c.id,
                type: "ci",
                provider: c.providerType,
                displayName: c.displayName || c.providerType,
              });
            }
          }
        }
        if (scm) {
          for (const s of scm) {
            if (s.isActive) {
              opts.push({
                id: s.id,
                type: "scm",
                provider: s.providerType,
                displayName: s.displayName || s.providerType,
              });
            }
          }
        }
        setProviders(opts);
      })
      .catch(() => setProviders([]))
      .finally(() => setLoadingProviders(false));
  }, [open]);

  const loadRepos = useCallback(async (prov: ProviderOption) => {
    setSelectedProvider(prov);
    setStep("repos");
    setLoadingRepos(true);
    setRepos([]);
    setSelected(new Set());
    setRepoSearch("");

    try {
      if (prov.type === "ci") {
        const data = await fetchAvailableRepos(prov.id);
        if (data) {
          setRepos(data.map((r: AvailableRepo) => ({
            externalRepoId: r.externalRepoId,
            name: r.name,
            defaultBranch: r.defaultBranch,
          })));
        }
      } else {
        const data = await fetchScmAvailableRepos(prov.id);
        if (data?.repos) {
          setRepos(data.repos.map((r: ScmAvailableRepo) => ({
            externalRepoId: r.externalRepoId,
            name: r.name,
            defaultBranch: r.defaultBranch,
          })));
        }
      }
    } catch {
      setRepos([]);
    } finally {
      setLoadingRepos(false);
    }
  }, []);

  const toggleRepo = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    if (!selectedProvider || selected.size === 0) return;
    setAdding(true);
    const reposToAdd = repos
      .filter((r) => selected.has(r.externalRepoId))
      .map(({ externalRepoId, name, defaultBranch }) => ({ externalRepoId, name, defaultBranch }));

    await addRepositoriesToOrg(selectedProvider.id, selectedProvider.type, reposToAdd);
    setAdding(false);
    onAdded();
    onClose();
  };

  const filteredRepos = useMemo(() => {
    if (!repoSearch.trim()) return repos;
    const q = repoSearch.toLowerCase();
    return repos.filter((r) => r.name.toLowerCase().includes(q));
  }, [repos, repoSearch]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg rounded-2xl border border-border/50 bg-card p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Add Repository</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {step === "provider" && (
          <div>
            <p className="text-sm text-muted-foreground mb-3">Select a provider to browse repositories</p>
            {loadingProviders ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin text-brand-cyan" size={20} />
              </div>
            ) : providers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No providers configured. Add a CI or SCM provider in Settings first.
              </p>
            ) : (
              <div className="grid gap-2">
                {providers.map((p) => {
                  const badge = PROVIDER_BADGE[p.provider];
                  return (
                    <button
                      key={`${p.type}-${p.id}`}
                      onClick={() => loadRepos(p)}
                      className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-card/60 hover:border-brand-cyan/30 transition-all text-left"
                    >
                      <div className={`rounded-lg px-2 py-1 text-xs font-bold uppercase ${badge?.bg ?? "bg-muted"} ${badge?.color ?? "text-muted-foreground"}`}>
                        {badge?.label ?? p.provider}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{p.displayName}</p>
                        <p className="text-xs text-muted-foreground">{p.type.toUpperCase()} Provider</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {step === "repos" && (
          <div>
            <button
              onClick={() => setStep("provider")}
              className="text-xs text-brand-cyan hover:underline mb-3"
            >
              &larr; Back to providers
            </button>

            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search repos..."
                value={repoSearch}
                onChange={(e) => setRepoSearch(e.target.value)}
                className="w-full pl-8 pr-4 py-2 rounded-lg border border-border/40 bg-card/60 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-brand-cyan/40"
              />
            </div>

            {loadingRepos ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin text-brand-cyan" size={20} />
              </div>
            ) : filteredRepos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No repos found</p>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-1">
                {filteredRepos.map((r) => (
                  <label
                    key={r.externalRepoId}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-card/80 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(r.externalRepoId)}
                      onChange={() => toggleRepo(r.externalRepoId)}
                      className="accent-brand-cyan"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.defaultBranch}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {selected.size > 0 && (
              <button
                onClick={handleAdd}
                disabled={adding}
                className="mt-4 w-full rounded-xl bg-gradient-to-r from-brand-cyan to-brand-cyan/80 px-4 py-2.5 text-sm font-bold text-black shadow-lg shadow-brand-cyan/25 transition-all hover:shadow-xl disabled:opacity-50"
              >
                {adding ? (
                  <Loader2 className="inline animate-spin mr-2" size={14} />
                ) : null}
                Add {selected.size} repositor{selected.size === 1 ? "y" : "ies"}
              </button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─── Pipeline Runs Tab ──────────────────────────────────────────────────────

function PipelineRunsTab({ repositoryId }: { repositoryId: string }) {
  const [runs, setRuns] = useState<ProviderPipelineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerFilter, setProviderFilter] = useState<string>("all");

  useEffect(() => {
    setLoading(true);
    fetchProjectPipelines(repositoryId, 30)
      .then((data) => setRuns(data ?? []))
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }, [repositoryId]);

  // Derive unique providers for filter buttons
  const providers = useMemo(() => {
    const set = new Set(runs.map((r) => r.provider));
    return Array.from(set);
  }, [runs]);

  const filtered = useMemo(
    () => providerFilter === "all" ? runs : runs.filter((r) => r.provider === providerFilter),
    [runs, providerFilter],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
        <Loader2 className="animate-spin text-brand-cyan" size={14} />
        Loading pipelines...
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="py-4 text-center">
        <Activity size={24} className="mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">No pipeline runs found</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Provider filter */}
      {providers.length > 1 && (
        <div className="flex items-center gap-1.5 pb-1">
          <Filter size={12} className="text-muted-foreground" />
          <button
            onClick={() => setProviderFilter("all")}
            className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase transition-colors ${
              providerFilter === "all"
                ? "bg-brand-cyan/20 text-brand-cyan"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            All ({runs.length})
          </button>
          {providers.map((p) => {
            const badge = PROVIDER_BADGE[p];
            const count = runs.filter((r) => r.provider === p).length;
            return (
              <button
                key={p}
                onClick={() => setProviderFilter(p)}
                className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase transition-colors ${
                  providerFilter === p
                    ? `${badge?.bg ?? "bg-muted"} ${badge?.color ?? "text-foreground"}`
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                }`}
              >
                {badge?.label ?? p} ({count})
              </button>
            );
          })}
        </div>
      )}

      {filtered.map((run) => {
        const cfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.unknown;
        const Icon = cfg.icon;
        const badge = PROVIDER_BADGE[run.provider];

        return (
          <div
            key={run.externalRunId}
            className="rounded-lg border border-border/40 bg-card/60 overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-2.5">
              <Icon
                size={16}
                className={`shrink-0 ${cfg.color} ${run.status === "running" ? "animate-spin" : ""}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold truncate">
                    {run.workflowName ?? "Pipeline"}
                  </span>
                  {badge && (
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${badge.bg} ${badge.color}`}>
                      {badge.label}
                    </span>
                  )}
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${cfg.color}`}>
                    {cfg.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  {run.triggerUser && (
                    <span className="flex items-center gap-1">
                      <User size={10} />
                      {run.triggerUser}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <GitBranch size={10} />
                    {run.branch}
                  </span>
                  {run.commitSha && (
                    <span className="font-mono">{run.commitSha.slice(0, 7)}</span>
                  )}
                  {run.duration !== null && (
                    <span className="flex items-center gap-1">
                      <Timer size={10} />
                      {formatDuration(run.duration)}
                    </span>
                  )}
                  <span className="ml-auto">{formatTimeAgo(run.startedAt)}</span>
                </div>
                {run.commitMessage && (
                  <p className="text-xs text-muted-foreground/70 mt-0.5 truncate flex items-center gap-1">
                    <MessageSquare size={9} />
                    {run.commitMessage}
                  </p>
                )}
              </div>
              {run.url && (
                <a
                  href={run.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 text-muted-foreground hover:text-brand-cyan transition-colors"
                >
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
            {/* Error summary + AI fix status for failed pipelines */}
            {run.status === "failed" && (
              <div className="px-4 py-1.5 border-t border-red-500/10 bg-red-500/5 space-y-1">
                {run.errorSummary && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={12} className="text-red-400 shrink-0" />
                    <span className="text-xs text-red-400 truncate">{run.errorSummary}</span>
                  </div>
                )}
                {run.fixStatus && (
                  <div className="flex items-center gap-2">
                    <Bot size={12} className={
                      run.fixStatus === "running" ? "text-brand-cyan animate-pulse" :
                      run.fixStatus === "queued" ? "text-yellow-400" :
                      run.fixStatus === "success" ? "text-emerald-400" : "text-red-400"
                    } />
                    <span className={`text-xs ${
                      run.fixStatus === "running" ? "text-brand-cyan" :
                      run.fixStatus === "queued" ? "text-yellow-400" :
                      run.fixStatus === "success" ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {run.fixStatus === "running" ? "AI agent fixing..." :
                       run.fixStatus === "queued" ? "AI fix queued" :
                       run.fixStatus === "success" ? "AI fix applied" : "AI fix failed"}
                    </span>
                    {run.fixPrUrl && (
                      <a
                        href={run.fixPrUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-brand-cyan hover:underline"
                      >
                        View PR
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── CI Provider Links Tab ──────────────────────────────────────────────────

type CiProviderOption = { id: string; providerType: string; displayName: string };

function CiLinksTab({ repositoryId }: { repositoryId: string }) {
  const [links, setLinks] = useState<RepoCiLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [providers, setProviders] = useState<CiProviderOption[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [pipelineName, setPipelineName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPipelineName, setEditPipelineName] = useState("");

  // Auto-fetched jobs from selected CI provider
  const [jobs, setJobs] = useState<ProviderJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [useCustomName, setUseCustomName] = useState(false);

  const loadLinks = useCallback(() => {
    setLoading(true);
    fetchRepoCiLinks(repositoryId)
      .then((data) => setLinks(data ?? []))
      .catch(() => setLinks([]))
      .finally(() => setLoading(false));
  }, [repositoryId]);

  useEffect(() => { loadLinks(); }, [loadLinks]);

  const openAddForm = useCallback(() => {
    setShowAdd(true);
    setSelectedProviderId("");
    setPipelineName("");
    setJobs([]);
    setUseCustomName(false);
    setLoadingProviders(true);
    fetchCiProviders()
      .then((data) => {
        if (data) {
          setProviders(
            data.filter((c) => c.isActive).map((c) => ({
              id: c.id,
              providerType: c.providerType,
              displayName: c.displayName || c.providerType,
            })),
          );
        }
      })
      .catch(() => setProviders([]))
      .finally(() => setLoadingProviders(false));
  }, []);

  // When a CI provider is selected, auto-fetch its jobs
  const handleProviderSelect = useCallback((configId: string) => {
    setSelectedProviderId(configId);
    setPipelineName("");
    setUseCustomName(false);
    if (!configId) {
      setJobs([]);
      return;
    }
    setLoadingJobs(true);
    fetchCiProviderJobs(configId)
      .then((data) => setJobs(data ?? []))
      .catch(() => setJobs([]))
      .finally(() => setLoadingJobs(false));
  }, []);

  const handleAdd = async () => {
    if (!selectedProviderId) return;
    setAdding(true);
    await addRepoCiLink(repositoryId, selectedProviderId, pipelineName || undefined);
    setAdding(false);
    setShowAdd(false);
    loadLinks();
  };

  const handleRemove = async (linkId: string) => {
    await removeRepoCiLink(repositoryId, linkId);
    loadLinks();
  };

  const startEdit = (link: RepoCiLink) => {
    setEditingId(link.id);
    setEditPipelineName(link.pipelineName ?? "");
  };

  const handleSaveEdit = async (linkId: string) => {
    await updateRepoCiLink(repositoryId, linkId, { pipelineName: editPipelineName || undefined });
    setEditingId(null);
    loadLinks();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
        <Loader2 className="animate-spin text-brand-cyan" size={14} />
        Loading CI providers...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {links.length === 0 && !showAdd && (
        <div className="py-4 text-center">
          <Link2 size={24} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No CI providers linked to this repository</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Link a CI provider to see pipeline runs from Jenkins, GitLab CI, GitHub Actions, etc.
          </p>
        </div>
      )}

      {links.map((link) => {
        const badge = PROVIDER_BADGE[link.providerType];
        const isEditing = editingId === link.id;

        return (
          <div
            key={link.id}
            className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border/40 bg-card/60"
          >
            <div className={`rounded-lg px-2 py-1 text-[10px] font-bold uppercase ${badge?.bg ?? "bg-muted"} ${badge?.color ?? "text-muted-foreground"}`}>
              {badge?.label ?? link.providerType}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{link.displayName}</p>
              {isEditing ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={editPipelineName}
                    onChange={(e) => setEditPipelineName(e.target.value)}
                    placeholder="Pipeline/job name (optional)"
                    className="flex-1 px-2 py-1 rounded border border-border/40 bg-card/60 text-xs placeholder:text-muted-foreground focus:outline-none focus:border-brand-cyan/40"
                  />
                  <button
                    onClick={() => handleSaveEdit(link.id)}
                    className="text-brand-cyan hover:text-brand-cyan/80 transition-colors"
                    title="Save"
                  >
                    <Save size={14} />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Cancel"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {link.pipelineName ? `Job: ${link.pipelineName}` : "Using default job name"}
                </p>
              )}
            </div>
            {!isEditing && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => startEdit(link)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-card/80 transition-all"
                  title="Edit pipeline name"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => handleRemove(link.id)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-all"
                  title="Unlink CI provider"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {showAdd && (
        <div className="rounded-lg border border-brand-cyan/20 bg-brand-cyan/5 p-4 space-y-3">
          <p className="text-sm font-semibold">Link a CI Provider</p>
          {loadingProviders ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="animate-spin text-brand-cyan" size={14} />
              <span className="text-xs text-muted-foreground">Loading providers...</span>
            </div>
          ) : providers.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No CI providers configured. Add one in Settings &rarr; CI Providers first.
            </p>
          ) : (
            <>
              <select
                value={selectedProviderId}
                onChange={(e) => handleProviderSelect(e.target.value)}
                className="w-full rounded-lg border border-border/40 bg-card/60 px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan/40"
              >
                <option value="">Select a CI provider...</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName} ({p.providerType})
                  </option>
                ))}
              </select>

              {/* Job/Pipeline selector — auto-fetched from provider */}
              {selectedProviderId && (
                <>
                  {loadingJobs ? (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 className="animate-spin text-brand-cyan" size={14} />
                      <span className="text-xs text-muted-foreground">Fetching available jobs/pipelines...</span>
                    </div>
                  ) : useCustomName ? (
                    <div className="space-y-1">
                      <input
                        type="text"
                        value={pipelineName}
                        onChange={(e) => setPipelineName(e.target.value)}
                        placeholder="Enter custom pipeline/job name"
                        className="w-full rounded-lg border border-border/40 bg-card/60 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-brand-cyan/40"
                      />
                      {jobs.length > 0 && (
                        <button
                          onClick={() => { setUseCustomName(false); setPipelineName(""); }}
                          className="text-xs text-brand-cyan hover:underline"
                        >
                          Back to job list
                        </button>
                      )}
                    </div>
                  ) : jobs.length > 0 ? (
                    <div className="space-y-1">
                      <select
                        value={pipelineName}
                        onChange={(e) => setPipelineName(e.target.value)}
                        className="w-full rounded-lg border border-border/40 bg-card/60 px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan/40"
                      >
                        <option value="">Select a job/pipeline...</option>
                        {jobs.map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setUseCustomName(true)}
                        className="text-xs text-muted-foreground hover:text-brand-cyan"
                      >
                        Or enter a custom name
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">No jobs found. Enter a custom name instead:</p>
                      <input
                        type="text"
                        value={pipelineName}
                        onChange={(e) => setPipelineName(e.target.value)}
                        placeholder="Pipeline/job name"
                        className="w-full rounded-lg border border-border/40 bg-card/60 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-brand-cyan/40"
                      />
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={handleAdd}
                  disabled={!selectedProviderId || adding}
                  className="rounded-lg bg-gradient-to-r from-brand-cyan to-brand-cyan/80 px-4 py-2 text-xs font-bold text-black shadow-lg shadow-brand-cyan/25 transition-all hover:shadow-xl disabled:opacity-50"
                >
                  {adding ? <Loader2 className="inline animate-spin mr-1" size={12} /> : null}
                  Link Provider
                </button>
                <button
                  onClick={() => setShowAdd(false)}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {!showAdd && (
        <button
          onClick={openAddForm}
          className="flex items-center gap-2 rounded-lg border border-dashed border-border/50 px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-brand-cyan hover:border-brand-cyan/30 transition-all w-full justify-center"
        >
          <Plus size={14} />
          Link CI Provider
        </button>
      )}
    </div>
  );
}

// ─── Main Projects Page ─────────────────────────────────────────────────────

const ProjectsPage = () => {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isDemo, setIsDemo] = useState(false);
  const [providerFilter, setProviderFilter] = useState<string>("all");

  // Map project display ID -> backend UUID for API calls
  const [repoIdMap, setRepoIdMap] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Record<string, "branches" | "pipelines" | "ci-providers">>({});
  const [branchesMap, setBranchesMap] = useState<Record<string, Branch[]>>({});
  const [branchLoading, setBranchLoading] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const loadProjects = useCallback(() => {
    setLoading(true);
    fetchProjectsList()
      .then((data) => {
        if (!data || data.length === 0) {
          if (isDemoMode()) {
            setProjects(DEMO_PROJECTS);
            setIsDemo(true);
          } else {
            setProjects([]);
          }
          return;
        }
        const idMap: Record<string, string> = {};
        const mapped: Project[] = data.map((r: ProjectResponse) => {
          const displayId = r.repo.replace("/", "--");
          idMap[displayId] = r.id;
          return {
            id: displayId,
            name: r.name,
            repo: r.repo,
            branchCount: r.branchCount,
            defaultBranch: r.defaultBranch,
            lastActivity: r.lastActivity ?? "\u2014",
            provider: r.provider,
          };
        });
        setRepoIdMap(idMap);
        setProjects(mapped);
      })
      .catch(() => {
        if (isDemoMode()) {
          setProjects(DEMO_PROJECTS);
          setIsDemo(true);
        } else {
          setProjects([]);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    trackEvent(POSTHOG_EVENTS.PROJECTS_VIEWED);
    loadProjects();
  }, [loadProjects]);

  const toggleProject = useCallback(
    async (projectId: string) => {
      if (expandedId === projectId) {
        setExpandedId(null);
        return;
      }
      setExpandedId(projectId);
      if (!activeTab[projectId]) {
        setActiveTab((prev) => ({ ...prev, [projectId]: "branches" }));
      }

      if (branchesMap[projectId]) return;

      if (isDemo) {
        const demoBranches = DEMO_BRANCHES[projectId] ?? [];
        setBranchesMap((prev) => ({ ...prev, [projectId]: demoBranches }));
        return;
      }

      const backendId = repoIdMap[projectId];
      if (!backendId) return;

      setBranchLoading(projectId);
      try {
        const data = await fetchProjectBranches(backendId);
        if (data) {
          const mapped: Branch[] = data.map((b: BranchResponse) => ({
            id: b.id,
            name: b.name,
            author: b.author,
            commitCount: b.commitCount,
            lastCommit: b.lastCommit || "\u2014",
            pipelineStatus: "pending" as const,
          }));
          setBranchesMap((prev) => ({ ...prev, [projectId]: mapped }));
        } else {
          setBranchesMap((prev) => ({ ...prev, [projectId]: [] }));
        }
      } catch {
        setBranchesMap((prev) => ({ ...prev, [projectId]: [] }));
      } finally {
        setBranchLoading(null);
      }
    },
    [expandedId, branchesMap, isDemo, repoIdMap, activeTab],
  );

  // Compute provider counts for filter bar
  const providerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of projects) {
      const key = p.provider ?? "unknown";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [projects]);

  const uniqueProviders = useMemo(() => Object.keys(providerCounts).sort(), [providerCounts]);

  const filtered = useMemo(() => {
    let list = projects;
    if (providerFilter !== "all") {
      list = list.filter((p) => p.provider === providerFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.repo.toLowerCase().includes(q),
      );
    }
    return list;
  }, [projects, search, providerFilter]);

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
        <p className="text-red-400">Failed to load projects: {error}</p>
      </div>
    );
  }

  return (
    <PageTransition className="max-w-4xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">
            <span className="text-gradient">Projects</span>
          </h1>
          <p className="text-base text-muted-foreground mt-1 font-medium">
            Select a project to view its branches and pipeline activity
          </p>
        </div>
        {!isDemo && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-cyan to-brand-cyan/80 px-4 py-2.5 text-sm font-bold text-black shadow-lg shadow-brand-cyan/25 transition-all hover:shadow-xl hover:scale-105"
          >
            <Plus size={16} />
            Add Repository
          </button>
        )}
      </div>

      {/* Provider filter bar */}
      {!isDemo && uniqueProviders.length > 1 && (
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setProviderFilter("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              providerFilter === "all"
                ? "bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/30"
                : "bg-card/60 text-muted-foreground border border-border/40 hover:border-brand-cyan/20"
            }`}
          >
            All ({projects.length})
          </button>
          {uniqueProviders.map((prov) => {
            const badge = PROVIDER_BADGE[prov];
            return (
              <button
                key={prov}
                onClick={() => setProviderFilter(prov)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  providerFilter === prov
                    ? `${badge?.bg ?? "bg-muted"} ${badge?.color ?? "text-foreground"} border border-current/30`
                    : "bg-card/60 text-muted-foreground border border-border/40 hover:border-brand-cyan/20"
                }`}
              >
                {badge?.label ?? prov} ({providerCounts[prov] ?? 0})
              </button>
            );
          })}
        </div>
      )}

      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search projects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-cyan/40 focus:ring-1 focus:ring-brand-cyan/20 transition-all"
        />
      </div>

      <div className="grid gap-3">
        {filtered.map((project, i) => {
          const isExpanded = expandedId === project.id;
          const branches = branchesMap[project.id];
          const isBranchLoading = branchLoading === project.id;
          const tab = activeTab[project.id] ?? "branches";
          const backendId = repoIdMap[project.id];

          return (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <button
                onClick={() => toggleProject(project.id)}
                className="w-full text-left p-5 rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm hover:border-brand-cyan/30 hover:shadow-lg hover:shadow-brand-cyan/10 transition-all duration-300 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-primary/15 to-brand-cyan/15 flex items-center justify-center">
                      <FolderGit2 size={20} className="text-brand-cyan" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-bold text-foreground">{project.name}</p>
                        {project.provider && !isDemo && (() => {
                          const badge = PROVIDER_BADGE[project.provider];
                          return (
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${badge?.bg ?? "bg-muted"} ${badge?.color ?? "text-muted-foreground"}`}>
                              {badge?.label ?? project.provider}
                            </span>
                          );
                        })()}
                      </div>
                      <p className="text-xs text-muted-foreground/70 font-medium mt-0.5">{project.repo}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {/* Quick stats */}
                    <div className="hidden sm:flex items-center gap-4 mr-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Branches">
                        <GitBranch size={13} className="text-brand-cyan/60" />
                        <span className="font-semibold text-foreground/80">{project.branchCount}</span>
                      </div>
                      {project.defaultBranch && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Default branch">
                          <GitCommit size={13} className="text-green-400/60" />
                          <span className="font-mono text-foreground/70">{project.defaultBranch}</span>
                        </div>
                      )}
                      {project.lastActivity && project.lastActivity !== "\u2014" && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Last activity">
                          <Clock size={13} className="text-yellow-400/60" />
                          <span className="text-foreground/70">{new Date(project.lastActivity).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                    <ChevronDown
                      size={16}
                      className={`text-muted-foreground transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </div>
                </div>
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    {/* Tabs: Branches | Pipelines */}
                    {!isDemo && (
                      <div className="ml-6 mt-2 flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTab((prev) => ({ ...prev, [project.id]: "branches" }));
                          }}
                          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                            tab === "branches"
                              ? "bg-brand-cyan/15 text-brand-cyan"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <GitBranch size={12} />
                          Branches
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTab((prev) => ({ ...prev, [project.id]: "pipelines" }));
                          }}
                          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                            tab === "pipelines"
                              ? "bg-brand-cyan/15 text-brand-cyan"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Activity size={12} />
                          Pipelines
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTab((prev) => ({ ...prev, [project.id]: "ci-providers" }));
                          }}
                          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                            tab === "ci-providers"
                              ? "bg-brand-cyan/15 text-brand-cyan"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Link2 size={12} />
                          CI Providers
                        </button>
                      </div>
                    )}

                    <div className="ml-6 mt-1 border-l-2 border-border/40 pl-4 space-y-1 py-2">
                      {/* Branches Tab */}
                      {tab === "branches" && (
                        <>
                          {isBranchLoading && (
                            <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
                              <Loader2 className="animate-spin text-brand-cyan" size={14} />
                              Loading branches...
                            </div>
                          )}

                          {!isBranchLoading && branches && branches.length === 0 && (
                            <p className="text-sm text-muted-foreground py-3">No branches found</p>
                          )}

                          {!isBranchLoading &&
                            branches?.map((branch, j) => (
                              <motion.button
                                key={branch.id}
                                onClick={() =>
                                  router.push(`/commits?projectId=${project.id}&repoId=${repoIdMap[project.id] ?? ""}&branchId=${branch.id}`)
                                }
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: j * 0.03 }}
                                className="w-full text-left px-4 py-2.5 rounded-lg border border-border/40 bg-card/60 hover:border-brand-cyan/20 hover:shadow-md hover:shadow-brand-cyan/5 transition-all duration-200 group/branch"
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <GitBranch size={14} className="text-brand-cyan shrink-0" />
                                    <span className="text-sm font-bold truncate">{branch.name}</span>
                                  </div>
                                  <ArrowRight size={14} className="text-muted-foreground group-hover/branch:text-brand-cyan transition-colors shrink-0" />
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground ml-5">
                                  {branch.author && (
                                    <span className="flex items-center gap-1">
                                      <User size={10} />
                                      <span className="font-medium text-foreground/70">{branch.author}</span>
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <GitCommit size={10} />
                                    {branch.commitCount} commits
                                  </span>
                                  {branch.lastCommit && <span className="ml-auto">{branch.lastCommit}</span>}
                                </div>
                              </motion.button>
                            ))}
                        </>
                      )}

                      {/* Pipelines Tab */}
                      {tab === "pipelines" && backendId && (
                        <PipelineRunsTab repositoryId={backendId} />
                      )}

                      {/* CI Providers Tab */}
                      {tab === "ci-providers" && backendId && (
                        <CiLinksTab repositoryId={backendId} />
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
        {filtered.length === 0 && search.trim() && (
          <p className="text-center text-muted-foreground py-8 text-sm">No projects matching &ldquo;{search}&rdquo;</p>
        )}
        {projects.length === 0 && !search.trim() && (
          <div className="text-center py-16">
            <FolderGit2 size={48} className="mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-lg font-semibold text-muted-foreground">No projects yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Connect a CI or SCM provider in Settings, then click &ldquo;Add Repository&rdquo; to start monitoring.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-cyan to-brand-cyan/80 px-5 py-2.5 text-sm font-bold text-black shadow-lg shadow-brand-cyan/25 transition-all hover:shadow-xl"
            >
              <Plus size={16} />
              Add Repository
            </button>
          </div>
        )}
      </div>

      <AddRepoModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdded={loadProjects}
      />
    </PageTransition>
  );
};

export default ProjectsPage;
