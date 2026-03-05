"use client";

import { useCallback, useEffect, useState } from "react";
import {
  GitBranch,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  ExternalLink,
} from "lucide-react";
import type { CIProviderConfig } from "@/app/_libs/types/settings";
import type { CiProviderType } from "@/app/_libs/types/onboarding";
import {
  fetchCiProviders,
  addCiProvider,
  updateCiProvider,
  deleteCiProvider,
} from "@/app/_libs/healops-api";

const PROVIDER_META: Record<
  string,
  { name: string; description: string }
> = {
  github: { name: "GitHub Actions", description: "Connect via GitHub App" },
  gitlab: { name: "GitLab CI/CD", description: "Connect via access token" },
  bitbucket: { name: "Bitbucket Pipelines", description: "Connect via app password" },
  jenkins: { name: "Jenkins", description: "Connect via API token" },
};

type DialogStep = "select" | "configure";

export default function CIProvidersPage() {
  const [providers, setProviders] = useState<CIProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [dialogStep, setDialogStep] = useState<DialogStep>("select");
  const [selectedType, setSelectedType] = useState<CiProviderType | null>(null);
  const [configFields, setConfigFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadProviders = useCallback(async () => {
    const data = await fetchCiProviders();
    if (data) setProviders(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const handleAddProvider = async () => {
    if (!selectedType) return;
    setSaving(true);
    const result = await addCiProvider({
      provider: selectedType,
      accessToken: configFields.accessToken,
      serverUrl: configFields.serverUrl,
      displayName: configFields.displayName,
      githubInstallationId: configFields.installationId,
      scmProvider: selectedType === "jenkins" ? (configFields.scmProvider || "github") : undefined,
    });
    setSaving(false);
    if (result) {
      setShowDialog(false);
      setDialogStep("select");
      setSelectedType(null);
      setConfigFields({});
      void loadProviders();
    }
  };

  const handleToggleActive = async (p: CIProviderConfig) => {
    setTogglingId(p.id);
    await updateCiProvider(p.id, { isActive: !p.isActive });
    await loadProviders();
    setTogglingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteCiProvider(id);
    setDeleteConfirmId(null);
    void loadProviders();
  };

  const openDialog = () => {
    setShowDialog(true);
    setDialogStep("select");
    setSelectedType(null);
    setConfigFields({});
  };

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
          <h2 className="text-xl font-bold">CI Providers</h2>
          <p className="text-sm text-muted-foreground">
            Manage connected CI/CD providers
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

      <div className="space-y-3">
        {providers.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-5"
          >
            <div className="rounded-lg bg-brand-cyan/10 p-2.5">
              <GitBranch className="size-5 text-brand-cyan" />
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
        ))}

        {providers.length === 0 && (
          <div className="py-12 text-center">
            <GitBranch className="mx-auto mb-3 size-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No CI providers connected
            </p>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-zinc-900 p-6">
            <h3 className="text-lg font-semibold">Delete CI Provider</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to deactivate this CI provider? Repositories
              linked to this provider may lose monitoring capabilities.
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
                {dialogStep === "select" ? "Add CI Provider" : `Configure ${PROVIDER_META[selectedType ?? "github"]?.name}`}
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
                {(Object.entries(PROVIDER_META) as [string, { name: string; description: string }][]).map(
                  ([type, meta]) => (
                    <button
                      key={type}
                      onClick={() => {
                        setSelectedType(type as CiProviderType);
                        setDialogStep("configure");
                      }}
                      className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4 text-left transition-all hover:border-brand-cyan/30"
                    >
                      <GitBranch className="size-5 text-brand-cyan" />
                      <div>
                        <p className="text-sm font-semibold">{meta.name}</p>
                        <p className="text-xs text-muted-foreground">{meta.description}</p>
                      </div>
                    </button>
                  ),
                )}
              </div>
            )}

            {dialogStep === "configure" && selectedType === "github" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-brand-cyan/20 bg-brand-cyan/5 p-4">
                  <p className="text-sm">
                    Install the HealOps GitHub App on your organization.
                  </p>
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

            {dialogStep === "configure" && selectedType === "gitlab" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-brand-cyan/20 bg-brand-cyan/5 p-4">
                  <p className="mb-2 text-sm font-semibold text-brand-cyan">How to get your GitLab Access Token:</p>
                  <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                    <li>Go to your GitLab instance (gitlab.com or self-hosted)</li>
                    <li>
                      Navigate to{" "}
                      <strong className="text-foreground">Profile &rarr; Access Tokens</strong>{" "}
                      (or visit{" "}
                      <a
                        href="https://gitlab.com/-/user_settings/personal_access_tokens"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-cyan hover:underline"
                      >
                        gitlab.com/-/user_settings/personal_access_tokens
                      </a>)
                    </li>
                    <li>Click <strong className="text-foreground">Add new token</strong></li>
                    <li>Give it a name (e.g. &quot;HealOps&quot;) and set an expiry date</li>
                    <li>
                      Select scopes:{" "}
                      <code className="rounded bg-white/10 px-1 text-foreground">read_api</code> and{" "}
                      <code className="rounded bg-white/10 px-1 text-foreground">read_repository</code>
                    </li>
                    <li>Click <strong className="text-foreground">Create personal access token</strong> and copy the token</li>
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

            {dialogStep === "configure" && selectedType === "jenkins" && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Server URL</label>
                  <input
                    type="url"
                    value={configFields.serverUrl ?? ""}
                    onChange={(e) => setConfigFields((f) => ({ ...f, serverUrl: e.target.value }))}
                    placeholder="https://jenkins.example.com"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-brand-cyan/50"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">API Token</label>
                  <input
                    type="password"
                    value={configFields.accessToken ?? ""}
                    onChange={(e) => setConfigFields((f) => ({ ...f, accessToken: e.target.value }))}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-brand-cyan/50"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Username</label>
                  <input
                    type="text"
                    value={configFields.username ?? ""}
                    onChange={(e) => setConfigFields((f) => ({ ...f, username: e.target.value }))}
                    placeholder="admin"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-brand-cyan/50"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Source Code Platform</label>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Where does your source code live?
                  </p>
                  <div className="flex gap-2">
                    {(["github", "gitlab", "bitbucket"] as const).map((scm) => (
                      <button
                        key={scm}
                        type="button"
                        onClick={() => setConfigFields((f) => ({ ...f, scmProvider: scm }))}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                          (configFields.scmProvider || "github") === scm
                            ? "border-brand-cyan bg-brand-cyan/10 text-brand-cyan"
                            : "border-white/10 text-muted-foreground hover:border-white/20"
                        }`}
                      >
                        {scm === "github" ? "GitHub" : scm === "gitlab" ? "GitLab" : "Bitbucket"}
                      </button>
                    ))}
                  </div>
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
                    disabled={saving || !configFields.accessToken || !configFields.serverUrl}
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
