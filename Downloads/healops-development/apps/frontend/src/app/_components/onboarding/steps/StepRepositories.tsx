"use client";

import { useEffect, useState } from "react";
import { Search, FolderGit2, Check, Loader2 } from "lucide-react";
import type { OnboardingData } from "@/app/_libs/types/onboarding";
import { fetchRepos } from "@/app/_libs/github/github-service";

interface Props {
  data: Partial<OnboardingData>;
  onUpdate: (patch: Partial<OnboardingData>) => void;
}

interface Repo {
  externalRepoId: string;
  name: string;
  defaultBranch: string;
}

const FALLBACK_REPOS: Repo[] = [
  { externalRepoId: "1", name: "my-org/frontend", defaultBranch: "main" },
  { externalRepoId: "2", name: "my-org/backend", defaultBranch: "main" },
  { externalRepoId: "3", name: "my-org/api-gateway", defaultBranch: "develop" },
  { externalRepoId: "4", name: "my-org/mobile-app", defaultBranch: "main" },
  { externalRepoId: "5", name: "my-org/infra", defaultBranch: "main" },
];

export function StepRepositories({ data, onUpdate }: Props) {
  const [search, setSearch] = useState("");
  const [repos, setRepos] = useState<Repo[]>(FALLBACK_REPOS);
  const [loadingRepos, setLoadingRepos] = useState(true);

  const selected = data.repositories ?? [];
  const selectedIds = new Set(selected.map((r) => r.externalRepoId));

  useEffect(() => {
    async function loadRepos() {
      try {
        const projects = await fetchRepos();
        if (projects.length > 0) {
          setRepos(
            projects.map((p) => ({
              externalRepoId: p.id,
              name: p.repo,
              defaultBranch: "main",
            })),
          );
        }
      } catch {
        // Fall back to FALLBACK_REPOS (already set as default)
      } finally {
        setLoadingRepos(false);
      }
    }
    void loadRepos();
  }, []);

  const filtered = repos.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleRepo = (repo: Repo) => {
    if (selectedIds.has(repo.externalRepoId)) {
      onUpdate({
        repositories: selected.filter(
          (r) => r.externalRepoId !== repo.externalRepoId,
        ),
      });
    } else {
      onUpdate({
        repositories: [...selected, repo],
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

      <div className="max-h-64 space-y-2 overflow-y-auto">
        {loadingRepos ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-brand-cyan" />
            <span className="ml-2 text-sm text-muted-foreground">
              Loading repositories...
            </span>
          </div>
        ) : (
          filtered.map((repo) => {
            const isSelected = selectedIds.has(repo.externalRepoId);
            return (
              <button
                key={repo.externalRepoId}
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
                  <p className="text-sm font-medium">{repo.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Default: {repo.defaultBranch}
                  </p>
                </div>
              </button>
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
