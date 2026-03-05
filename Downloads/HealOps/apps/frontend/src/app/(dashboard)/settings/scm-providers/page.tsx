"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FolderGit2,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  ExternalLink,
  Search,
  Lock,
  Globe,
} from "lucide-react";
import type { SCMProviderConfig } from "@/app/_libs/types/settings";
import {
  fetchScmProviders,
  addScmProvider,
  updateScmProvider,
  deleteScmProvider,
  fetchScmAvailableRepos,
  isDemoMode,
} from "@/app/_libs/healops-api";
import type { ScmAvailableRepo } from "@/app/_libs/healops-api";

type ScmProviderType = "github" | "gitlab" | "bitbucket";

const PROVIDER_META: Record<
  ScmProviderType,
  { name: string; description: string }
> = {
  github: { name: "GitHub", description: "Connect via GitHub App installation" },
  gitlab: { name: "GitLab", description: "Connect via personal or project access token" },
  bitbucket: { name: "Bitbucket", description: "Connect via app password" },
};

type DialogStep = "select" | "configure";

export default function SCMProvidersPage() {
  const [providers, setProviders] = useState<SCMProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [dialogStep, setDialogStep] = useState<DialogStep>("select");
  const [selectedType, setSelectedType] = useState<ScmProviderType | null>(null);
  const [configFields, setConfigFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Repo browser state
  const [browsingProviderId, setBrowsingProviderId] = useState<string | null>(null);
  const [repos, setRepos] = useState<ScmAvailableRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [repoSearch, setRepoSearch] = useState("");
  const [repoError, setRepoError] = useState<string | null>(null);

  const loadProviders = useCallback(async () => {
    if (isDemoMode()) {
      setProviders([]);
      setLoading(false);
      return;
    }
    const data = await fetchScmProviders();
    if (data) setProviders(data.filter((p) => p.isActive !== false));
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const handleAddProvider = async () => {
    if (!selectedType) return;
    if (isDemoMode()) {
      const demoConfig: SCMProviderConfig = {
        id: `demo-${Date.now()}`,
        providerType: selectedType,
        displayName: PROVIDER_META[selectedType].name,
        isActive: true,
        hasToken: true,
        createdAt: new Date().toISOString(),
      };
      setProviders((prev) => [...prev, demoConfig]);
      setShowDialog(false);
      setDialogStep("select");
      setSelectedType(null);
      setConfigFields({});
      return;
    }

    setSaving(true);
    const result = await addScmProvider({
      provider: selectedType,
      ...(configFields.accessToken ? { accessToken: configFields.accessToken } : {}),
      ...(configFields.serverUrl ? { serverUrl: configFields.serverUrl } : {}),
      ...(configFields.workspace ? { workspace: configFields.workspace } : {}),
      ...(configFields.installationId ? { githubInstallationId: configFields.installationId } : {}),
    });
    setSaving(false);
    if (result) {
      setShowDialog(false);
      setDialogStep("select");
      setSelectedType(null);
      setConfigFields({});
      void loadProviders();
      // Auto-open repo browser for the new provider
      handleBrowseRepos(result.providerConfigId);
    }
  };

  const handleToggleActive = async (p: SCMProviderConfig) => {
    if (isDemoMode()) {
      setProviders((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, isActive: !x.isActive } : x)),
      );
      return;
    }
    setTogglingId(p.id);
    await updateScmProvider(p.id, { isActive: !p.isActive });
    await loadProviders();
    setTogglingId(null);
  };

  const handleDelete = async (id: string) => {
    if (isDemoMode()) {
      setProviders((prev) => prev.filter((x) => x.id !== id));
      setDeleteConfirmId(null);
      return;
    }
    await deleteScmProvider(id);
    setDeleteConfirmId(null);
    if (browsingProviderId === id) {
      setBrowsingProviderId(null);
      setRepos([]);
    }
    void loadProviders();
  };

  const handleBrowseRepos = async (providerId: string) => {
    setBrowsingProviderId(providerId);
    setReposLoading(true);
    setRepos([]);
    setRepoSearch("");
    setRepoError(null);
    const result = await fetchScmAvailableRepos(providerId);
    if (result) {
      setRepos(result.repos);
      if (result.error) setRepoError(result.error);
    }
    setReposLoading(false);
  };

  const openDialog = () => {
    setShowDialog(true);
    setDialogStep("select");
    setSelectedType(null);
    setConfigFields({});
  };

  const filteredRepos = repos.filter((r) =>
    r.name.toLowerCase().includes(repoSearch.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-brand-cyan" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">SCM Providers</h2>
          <p className="text-sm text-muted-foreground">
            Connect your source code platforms (GitHub, GitLab, Bitbucket)
          </p>
        </div>
        <button
          onClick={openDialog}
          className="flex items-center gap-2 rounded-lg bg-brand-cyan px-4 py-2 text-sm font-semibold text-black transition-all hover:bg-brand-cyan/90"
        >
          <Plus className="size-3.5" />
          Add Provider
        </button>
      </div>

      {/* Connected providers list */}
      <div className="space-y-3">
        {providers.map((p) => (
          <div
            key={p.id}
            className={`rounded-xl border p-5 transition-all ${
              browsingProviderId === p.id
                ? "border-brand-cyan/40 bg-brand-cyan/5"
                : "border-white/10 bg-white/5"
            }`}
          >
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-brand-cyan/10 p-2.5">
                <FolderGit2 className="size-5 text-brand-cyan" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">
                    {p.displayName ?? p.providerType}
                  </p>
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                    {p.providerType}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Connected {new Date(p.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {p.isActive && p.hasToken && (
                  <button
                    onClick={() => handleBrowseRepos(p.id)}
                    className="rounded-lg border border-brand-cyan/30 px-3 py-1.5 text-xs font-medium text-brand-cyan transition-all hover:bg-brand-cyan/10"
                  >
                    Browse Repos
                  </button>
                )}
                <button
                  onClick={() => handleToggleActive(p)}
                  disabled={togglingId === p.id}
                  className="transition-all"
                >
                  {togglingId === p.id ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  ) : p.isActive ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
                      <CheckCircle2 className="size-3.5" />
                      Active
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-medium text-red-400">
                      <XCircle className="size-3.5" />
                      Inactive
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setDeleteConfirmId(p.id)}
                  className="rounded p-1.5 text-muted-foreground transition-all hover:bg-red-400/10 hover:text-red-400"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {providers.length === 0 && (
          <div className="py-12 text-center">
            <FolderGit2 className="mx-auto mb-3 size-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No source code providers connected
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Connect GitHub, GitLab, or Bitbucket to start tracking repositories
            </p>
          </div>
        )}
      </div>

      {/* Repository browser panel */}
      {browsingProviderId && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Available Repositories
              {repos.length > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({repos.length} found)
                </span>
              )}
            </h3>
            <button
              onClick={() => {
                setBrowsingProviderId(null);
                setRepos([]);
              }}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          {reposLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-brand-cyan" />
              <span className="ml-2 text-sm text-muted-foreground">
                Fetching repositories...
              </span>
            </div>
          ) : repos.length === 0 ? (
            <div className="py-8 text-center text-sm">
              {repoError ? (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-red-400">
                  {repoError}
                </div>
              ) : (
                <p className="text-muted-foreground">No repositories found. Check your access token permissions.</p>
              )}
            </div>
          ) : (
            <>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={repoSearch}
                  onChange={(e) => setRepoSearch(e.target.value)}
                  placeholder="Search repositories..."
                  className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:border-brand-cyan/50"
                />
              </div>
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {filteredRepos.map((repo) => (
                  <div
                    key={repo.externalRepoId}
                    className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3"
                  >
                    {repo.isPrivate ? (
                      <Lock className="size-3.5 shrink-0 text-yellow-400" />
                    ) : (
                      <Globe className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{repo.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Branch: {repo.defaultBranch}</span>
                        {repo.language && <span>{repo.language}</span>}
                      </div>
                    </div>
                    {repo.url && (
                      <a
                        href={repo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-zinc-900 p-6">
            <h3 className="text-lg font-semibold">Remove SCM Provider</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to deactivate this source code provider?
              Repositories linked to this provider may lose access.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add provider dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-zinc-900 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {dialogStep === "select"
                  ? "Add Source Code Provider"
                  : `Configure ${PROVIDER_META[selectedType ?? "github"].name}`}
              </h3>
              <button
                onClick={() => setShowDialog(false)}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {dialogStep === "select" && (
              <div className="space-y-3">
                {(Object.entries(PROVIDER_META) as [ScmProviderType, { name: string; description: string }][]).map(
                  ([type, meta]) => (
                    <button
                      key={type}
                      onClick={() => {
                        setSelectedType(type);
                        setDialogStep("configure");
                      }}
                      className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4 text-left transition-all hover:border-brand-cyan/30"
                    >
                      <FolderGit2 className="size-5 text-brand-cyan" />
                      <div>
                        <p className="text-sm font-semibold">{meta.name}</p>
                        <p className="text-xs text-muted-foreground">{meta.description}</p>
                      </div>
                    </button>
                  ),
                )}
              </div>
            )}

            {/* GitHub configuration */}
            {dialogStep === "configure" && selectedType === "github" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-brand-cyan/20 bg-brand-cyan/5 p-4">
                  <p className="mb-2 text-sm font-semibold text-brand-cyan">Connect via GitHub App:</p>
                  <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                    <li>Click the <strong className="text-foreground">Install GitHub App</strong> button below</li>
                    <li>You will be redirected to GitHub to authorize the HealOps app</li>
                    <li>Select the organization or account to install on</li>
                    <li>Choose which repositories to grant access to (all or selected)</li>
                    <li>Click <strong className="text-foreground">Install</strong> — you&apos;ll be redirected back here</li>
                    <li>Then click <strong className="text-foreground">Save</strong> to complete the connection</li>
                  </ol>
                  <a
                    href="https://github.com/apps/healops-dev/installations/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-cyan px-4 py-2 text-sm font-semibold text-black hover:bg-brand-cyan/90"
                  >
                    Install GitHub App
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setDialogStep("select")}
                    className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleAddProvider}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-lg bg-brand-cyan px-4 py-2 text-sm font-semibold text-black hover:bg-brand-cyan/90 disabled:opacity-50"
                  >
                    {saving && <Loader2 className="size-4 animate-spin" />}
                    Save
                  </button>
                </div>
              </div>
            )}

            {/* GitLab configuration */}
            {dialogStep === "configure" && selectedType === "gitlab" && (
              <div className="space-y-4">
                {/* Step-by-step instructions */}
                <div className="rounded-lg border border-brand-cyan/20 bg-brand-cyan/5 p-4">
                  <p className="mb-2 text-sm font-semibold text-brand-cyan">How to get your GitLab Access Token:</p>
                  <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                    <li>Go to your GitLab instance (gitlab.com or self-hosted)</li>
                    <li>
                      Navigate to{" "}
                      <strong className="text-foreground">
                        Profile &rarr; Access Tokens
                      </strong>{" "}
                      (or visit{" "}
                      <a
                        href="https://gitlab.com/-/user_settings/personal_access_tokens"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-cyan hover:underline"
                      >
                        gitlab.com/-/user_settings/personal_access_tokens
                      </a>
                      )
                    </li>
                    <li>Click <strong className="text-foreground">Add new token</strong></li>
                    <li>Give it a name (e.g. &quot;HealOps&quot;) and set an expiry date</li>
                    <li>
                      Select scopes:{" "}
                      <code className="rounded bg-white/10 px-1 text-foreground">read_api</code> and{" "}
                      <code className="rounded bg-white/10 px-1 text-foreground">read_repository</code>
                    </li>
                    <li>Click <strong className="text-foreground">Create personal access token</strong></li>
                    <li>Copy the token (starts with <code className="rounded bg-white/10 px-1">glpat-</code>) and paste below</li>
                  </ol>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Server URL</label>
                  <input
                    type="url"
                    value={configFields.serverUrl ?? ""}
                    onChange={(e) => setConfigFields((f) => ({ ...f, serverUrl: e.target.value }))}
                    placeholder="https://gitlab.com"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-brand-cyan/50"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Leave blank for gitlab.com, or enter your self-hosted GitLab URL
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Access Token</label>
                  <input
                    type="password"
                    value={configFields.accessToken ?? ""}
                    onChange={(e) => setConfigFields((f) => ({ ...f, accessToken: e.target.value }))}
                    placeholder="glpat-xxxxxxxxxxxx"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-brand-cyan/50"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setDialogStep("select")}
                    className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleAddProvider}
                    disabled={saving || !configFields.accessToken}
                    className="flex items-center gap-2 rounded-lg bg-brand-cyan px-4 py-2 text-sm font-semibold text-black hover:bg-brand-cyan/90 disabled:opacity-50"
                  >
                    {saving && <Loader2 className="size-4 animate-spin" />}
                    Save
                  </button>
                </div>
              </div>
            )}

            {/* Bitbucket configuration */}
            {dialogStep === "configure" && selectedType === "bitbucket" && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Workspace</label>
                  <input
                    type="text"
                    value={configFields.workspace ?? ""}
                    onChange={(e) => setConfigFields((f) => ({ ...f, workspace: e.target.value }))}
                    placeholder="my-workspace"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-brand-cyan/50"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">App Password</label>
                  <input
                    type="password"
                    value={configFields.accessToken ?? ""}
                    onChange={(e) => setConfigFields((f) => ({ ...f, accessToken: e.target.value }))}
                    placeholder="ATBBxxxxxxxx"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-brand-cyan/50"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Create an app password with <code className="rounded bg-white/10 px-1">Repositories: Read</code> permission
                  </p>
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setDialogStep("select")}
                    className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleAddProvider}
                    disabled={saving || !configFields.accessToken}
                    className="flex items-center gap-2 rounded-lg bg-brand-cyan px-4 py-2 text-sm font-semibold text-black hover:bg-brand-cyan/90 disabled:opacity-50"
                  >
                    {saving && <Loader2 className="size-4 animate-spin" />}
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
