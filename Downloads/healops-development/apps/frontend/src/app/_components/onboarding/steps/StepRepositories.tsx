"use client";

import { useEffect, useState } from "react";
import { Search, FolderGit2, Check, Loader2, GitBranch, PlugZap } from "lucide-react";
import type { OnboardingData, CiProviderEntry, ScmProviderEntry } from "@/app/_libs/types/onboarding";
import { fetchRepos } from "@/app/_libs/github/github-service";
import { fetchAvailableRepos, fetchScmAvailableRepos, isDemoMode } from "@/app/_libs/healops-api";
import { PROVIDER_META } from "./StepCIProvider";

interface Props {
  data: Partial<OnboardingData>;
  onUpdate: (patch: Partial<OnboardingData>) => void;
}

interface Repo {
  externalRepoId: string;
  name: string;
  defaultBranch: string;
  provider: string;
  providerConfigId?: string;
}

const FALLBACK_REPOS: Repo[] = [
  { externalRepoId: "1", name: "my-org/frontend", defaultBranch: "main", provider: "github" },
  { externalRepoId: "2", name: "my-org/backend", defaultBranch: "main", provider: "github" },
  { externalRepoId: "3", name: "my-org/api-gateway", defaultBranch: "develop", provider: "github" },
  { externalRepoId: "4", name: "my-org/mobile-app", defaultBranch: "main", provider: "gitlab" },
  { externalRepoId: "5", name: "my-org/infra", defaultBranch: "main", provider: "jenkins" },
];

export function StepRepositories({ data, onUpdate }: Props) {
  const [search, setSearch] = useState("");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);

  const selected = data.repositories ?? [];
  const selectedIds = new Set(selected.map((r) => r.externalRepoId));

  const providers: CiProviderEntry[] = data.ciProviders ?? (data.ciProvider ? [data.ciProvider] : []);
  const scmProviders: ScmProviderEntry[] = data.scmProviders ?? [];

  useEffect(() => {
    async function loadRepos() {
      const allRepos: Repo[] = [];
      let anySuccess = false;

      // Fetch repos from each configured CI provider
      for (const provider of providers) {
        try {
          if (provider.providerConfigId) {
            const result = await fetchAvailableRepos(provider.providerConfigId);
            if (result && result.length > 0) {
              allRepos.push(
                ...result.map((r) => ({
                  externalRepoId: r.externalRepoId,
                  name: r.name,
                  defaultBranch: r.defaultBranch,
                  provider: r.provider,
                  providerConfigId: r.providerConfigId,
                })),
              );
              anySuccess = true;
              continue;
            }
          }

          // Fallback: for GitHub, try the direct GitHub API
          if (provider.type === "github") {
            const projects = await fetchRepos();
            if (projects.length > 0) {
              allRepos.push(
                ...projects.map((p) => ({
                  externalRepoId: p.id,
                  name: p.repo,
                  defaultBranch: "main",
                  provider: "github",
                  providerConfigId: provider.providerConfigId,
                })),
              );
              anySuccess = true;
            }
          }
        } catch {
          // Continue to next provider
        }
      }

      // Also fetch repos from SCM providers
      for (const scm of scmProviders) {
        try {
          if (scm.providerConfigId) {
            const result = await fetchScmAvailableRepos(scm.providerConfigId);
            if (result && result.repos.length > 0) {
              allRepos.push(
                ...result.repos.map((r) => ({
                  externalRepoId: r.externalRepoId,
                  name: r.name,
                  defaultBranch: r.defaultBranch,
                  provider: result.provider,
                  providerConfigId: result.providerConfigId,
                })),
              );
              anySuccess = true;
            }
          }
        } catch {
          // Continue to next provider
        }
      }

      if (!anySuccess && isDemoMode()) {
        setRepos(FALLBACK_REPOS);
      } else {
        setRepos(allRepos);
      }
      setLoadingRepos(false);
    }
    void loadRepos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = repos.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()),
  );

  // Group repos by provider for display
  const groupedProviders = [...new Set(filtered.map((r) => r.provider))];

  const toggleRepo = (repo: Repo) => {
    if (selectedIds.has(repo.externalRepoId)) {
      onUpdate({
        repositories: selected.filter(
          (r) => r.externalRepoId !== repo.externalRepoId,
        ),
      });
    } else {
      onUpdate({
        repositories: [
          ...selected,
          {
            externalRepoId: repo.externalRepoId,
            name: repo.name,
            defaultBranch: repo.defaultBranch,
            providerConfigId: repo.providerConfigId,
          },
        ],
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Select repositories</h2>
        <p className="text-sm text-muted-foreground">
          Choose which repositories HealOps should monitor for pipeline failures
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search repositories..."
          className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
        />
      </div>

      <div className="max-h-64 space-y-4 overflow-y-auto">
        {loadingRepos ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-brand-cyan" />
            <span className="ml-2 text-sm text-muted-foreground">
              Loading repositories...
            </span>
          </div>
        ) : filtered.length === 0 && !search.trim() ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <PlugZap className="size-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-semibold text-muted-foreground">No repositories found</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Go back and connect a CI or SCM provider to import your repositories.
            </p>
          </div>
        ) : (
          groupedProviders.map((providerKey) => {
            const providerRepos = filtered.filter((r) => r.provider === providerKey);
            const meta = PROVIDER_META[providerKey as keyof typeof PROVIDER_META];

            return (
              <div key={providerKey}>
                {groupedProviders.length > 1 && (
                  <div className="mb-2 flex items-center gap-2">
                    <GitBranch className="size-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {meta?.name ?? providerKey}
                    </span>
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {providerRepos.length}
                    </span>
                  </div>
                )}
                <div className="space-y-2">
                  {providerRepos.map((repo) => {
                    const isSelected = selectedIds.has(repo.externalRepoId);
                    return (
                      <button
                        key={`${repo.provider}-${repo.externalRepoId}`}
                        onClick={() => toggleRepo(repo)}
                        className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all ${
                          isSelected
                            ? "border-brand-cyan bg-brand-cyan/5"
                            : "border-white/10 bg-white/[0.02] hover:border-white/20"
                        }`}
                      >
                        <div
                          className={`flex size-5 items-center justify-center rounded border transition-all ${
                            isSelected
                              ? "border-brand-cyan bg-brand-cyan"
                              : "border-white/20"
                          }`}
                        >
                          {isSelected && <Check className="size-3 text-black" />}
                        </div>
                        <FolderGit2 className="size-4 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{repo.name}</p>
                            {groupedProviders.length > 1 && (
                              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                                {repo.provider}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Default: {repo.defaultBranch}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {selected.length} repositor{selected.length === 1 ? "y" : "ies"}{" "}
        selected
      </p>
    </div>
  );
}
