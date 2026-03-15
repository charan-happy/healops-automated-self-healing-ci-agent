"use client";

import { ExternalLink, Check, Info } from "lucide-react";
import type { OnboardingData, ScmProviderType, ScmProviderEntry } from "@/app/_libs/types/onboarding";

interface Props {
  data: Partial<OnboardingData>;
  onUpdate: (patch: Partial<OnboardingData>) => void;
}

export const SCM_PROVIDER_META: Record<
  ScmProviderType,
  { name: string; description: string; color: string }
> = {
  github: {
    name: "GitHub",
    description: "Connect via GitHub App installation",
    color: "#24292f",
  },
  gitlab: {
    name: "GitLab",
    description: "Connect via project access token",
    color: "#fc6d26",
  },
  bitbucket: {
    name: "Bitbucket",
    description: "Connect via app password and workspace",
    color: "#0052cc",
  },
};

const SCM_TYPES: ScmProviderType[] = ["github", "gitlab", "bitbucket"];

export function StepSCMProvider({ data, onUpdate }: Props) {
  const selected = data.scmProviders ?? [];
  const selectedTypes = new Set(selected.map((p) => p.type));

  const toggleProvider = (type: ScmProviderType) => {
    if (selectedTypes.has(type)) {
      onUpdate({
        scmProviders: selected.filter((p) => p.type !== type),
      });
    } else {
      const entry: ScmProviderEntry = { type, config: {} };
      onUpdate({
        scmProviders: [...selected, entry],
      });
    }
  };

  const setConfig = (type: ScmProviderType, key: string, value: string) => {
    const updated = selected.map((p) =>
      p.type === type ? { ...p, config: { ...p.config, [key]: value } } : p,
    );
    onUpdate({ scmProviders: updated });
  };

  const getConfig = (type: ScmProviderType): Record<string, string> => {
    return selected.find((p) => p.type === type)?.config ?? {};
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Connect your source code</h2>
        <p className="text-sm text-muted-foreground">
          Select where your source code is hosted so HealOps can access
          repositories and create fix PRs
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {SCM_TYPES.map((type) => {
          const meta = SCM_PROVIDER_META[type];
          const isSelected = selectedTypes.has(type);
          return (
            <button
              key={type}
              onClick={() => toggleProvider(type)}
              className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-all ${
                isSelected
                  ? "border-brand-cyan bg-brand-cyan/5"
                  : "border-border/30 bg-card/50 hover:border-border/50"
              }`}
            >
              <div
                className={`flex size-5 shrink-0 items-center justify-center rounded border mt-0.5 transition-all ${
                  isSelected
                    ? "border-brand-cyan bg-brand-cyan"
                    : "border-border/50"
                }`}
              >
                {isSelected && <Check className="size-3 text-black" />}
              </div>
              <div>
                <p className="text-sm font-semibold">{meta.name}</p>
                <p className="text-xs text-muted-foreground">
                  {meta.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Provider-specific config forms */}
      {selected.map((entry) => (
        <div key={entry.type} className="space-y-3">
          <p className="text-sm font-semibold text-brand-cyan">
            {SCM_PROVIDER_META[entry.type].name} Configuration
          </p>

          {entry.type === "github" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-brand-cyan/20 bg-brand-cyan/5 p-4">
                <p className="text-sm">
                  Install the HealOps GitHub App to grant repository access.
                </p>
                <a
                  href="https://github.com/apps/healops-dev/installations/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-cyan px-4 py-2 text-sm font-semibold text-black transition-all hover:bg-brand-cyan/90"
                >
                  Install GitHub App
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
              <div className="rounded-lg border border-border/30 bg-card/50 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Info className="size-3.5 text-brand-cyan" />
                  How to install the GitHub App:
                </div>
                <ol className="ml-5 list-decimal space-y-1 text-xs text-muted-foreground">
                  <li>Click the &quot;Install GitHub App&quot; button above</li>
                  <li>Select your <strong>organization</strong> or personal account</li>
                  <li>Choose <strong>All repositories</strong> or select specific ones</li>
                  <li>Click <strong>Install</strong> to authorize</li>
                  <li>You&apos;ll be redirected back — HealOps will detect the installation automatically</li>
                </ol>
              </div>
            </div>
          )}

          {entry.type === "gitlab" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border/30 bg-card/50 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Info className="size-3.5 text-brand-cyan" />
                  How to get your GitLab Access Token:
                </div>
                <ol className="ml-5 list-decimal space-y-1 text-xs text-muted-foreground">
                  <li>Go to your GitLab instance (<strong>gitlab.com</strong> or self-hosted)</li>
                  <li>Navigate to <strong>Profile → Access Tokens</strong> (or visit <code className="rounded bg-muted/50 px-1">gitlab.com/-/user_settings/personal_access_tokens</code>)</li>
                  <li>Click <strong>Add new token</strong></li>
                  <li>Give it a name (e.g. &quot;HealOps&quot;) and set an expiry date</li>
                  <li>Select scopes: <code className="rounded bg-muted/50 px-1">read_api</code> and <code className="rounded bg-muted/50 px-1">read_repository</code></li>
                  <li>Click <strong>Create personal access token</strong></li>
                  <li>Copy the token (starts with <code className="rounded bg-muted/50 px-1">glpat-</code>) and paste below</li>
                </ol>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  GitLab Server URL
                </label>
                <input
                  type="url"
                  value={getConfig("gitlab").serverUrl ?? ""}
                  onChange={(e) =>
                    setConfig("gitlab", "serverUrl", e.target.value)
                  }
                  placeholder="https://gitlab.com"
                  className="w-full rounded-lg border border-border/30 bg-card/50 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Access Token
                </label>
                <input
                  type="password"
                  value={getConfig("gitlab").accessToken ?? ""}
                  onChange={(e) =>
                    setConfig("gitlab", "accessToken", e.target.value)
                  }
                  placeholder="glpat-xxxxxxxxxxxx"
                  className="w-full rounded-lg border border-border/30 bg-card/50 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
                />
              </div>
            </div>
          )}

          {entry.type === "bitbucket" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border/30 bg-card/50 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Info className="size-3.5 text-brand-cyan" />
                  How to create a Bitbucket App Password:
                </div>
                <ol className="ml-5 list-decimal space-y-1 text-xs text-muted-foreground">
                  <li>Go to <strong>bitbucket.org</strong> and log in</li>
                  <li>Click your avatar → <strong>Personal settings</strong></li>
                  <li>Under &quot;Access management&quot;, click <strong>App passwords</strong></li>
                  <li>Click <strong>Create app password</strong></li>
                  <li>Give it a label (e.g. &quot;HealOps&quot;)</li>
                  <li>Select permissions: <code className="rounded bg-muted/50 px-1">Repositories: Read</code> and <code className="rounded bg-muted/50 px-1">Pull requests: Write</code></li>
                  <li>Click <strong>Create</strong> and copy the generated password</li>
                </ol>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Workspace
                </label>
                <input
                  type="text"
                  value={getConfig("bitbucket").workspace ?? ""}
                  onChange={(e) =>
                    setConfig("bitbucket", "workspace", e.target.value)
                  }
                  placeholder="my-workspace"
                  className="w-full rounded-lg border border-border/30 bg-card/50 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  App Password
                </label>
                <input
                  type="password"
                  value={getConfig("bitbucket").appPassword ?? ""}
                  onChange={(e) =>
                    setConfig("bitbucket", "appPassword", e.target.value)
                  }
                  placeholder="ATBBxxxxxxxx"
                  className="w-full rounded-lg border border-border/30 bg-card/50 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
                />
              </div>
            </div>
          )}
        </div>
      ))}

      {selected.length === 0 && (
        <p className="text-xs text-muted-foreground/70">
          You can skip this step if your CI provider already has access to your
          repositories (e.g. GitHub Actions).
        </p>
      )}

      {selected.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selected.length} provider{selected.length === 1 ? "" : "s"} selected
        </p>
      )}
    </div>
  );
}
