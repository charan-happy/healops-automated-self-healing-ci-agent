"use client";

import { ExternalLink, Check } from "lucide-react";
import type { OnboardingData, CiProviderType, CiProviderEntry } from "@/app/_libs/types/onboarding";

interface Props {
  data: Partial<OnboardingData>;
  onUpdate: (patch: Partial<OnboardingData>) => void;
}

/** Metadata for each provider — reused in StepRepositories and Settings */
export const PROVIDER_META: Record<
  CiProviderType,
  { name: string; description: string; color: string }
> = {
  github: {
    name: "GitHub Actions",
    description: "Install the HealOps GitHub App for automated access",
    color: "#24292f",
  },
  gitlab: {
    name: "GitLab CI/CD",
    description: "Connect via project access token",
    color: "#fc6d26",
  },
  bitbucket: {
    name: "Bitbucket Pipelines",
    description: "Connect via app password and workspace",
    color: "#0052cc",
  },
  jenkins: {
    name: "Jenkins",
    description: "Connect via API token and server URL",
    color: "#d33833",
  },
};

const PROVIDER_TYPES: CiProviderType[] = ["github", "gitlab", "bitbucket", "jenkins"];

export function StepCIProvider({ data, onUpdate }: Props) {
  const selected = data.ciProviders ?? [];
  const selectedTypes = new Set(selected.map((p) => p.type));

  const toggleProvider = (type: CiProviderType) => {
    if (selectedTypes.has(type)) {
      // Remove this provider
      onUpdate({
        ciProviders: selected.filter((p) => p.type !== type),
        // Keep legacy field in sync with first provider
        ciProvider: selected.filter((p) => p.type !== type)[0] ?? { type: "github", config: {} },
      });
    } else {
      // Add this provider
      const entry: CiProviderEntry = { type, config: {} };
      const updated = [...selected, entry];
      onUpdate({
        ciProviders: updated,
        ciProvider: updated[0] ?? { type: "github", config: {} },
      });
    }
  };

  const setConfig = (type: CiProviderType, key: string, value: string) => {
    const updated = selected.map((p) =>
      p.type === type ? { ...p, config: { ...p.config, [key]: value } } : p,
    );
    onUpdate({
      ciProviders: updated,
      ciProvider: updated[0] ?? { type: "github", config: {} },
    });
  };

  const getConfig = (type: CiProviderType): Record<string, string> => {
    return selected.find((p) => p.type === type)?.config ?? {};
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Select your CI providers</h2>
        <p className="text-sm text-muted-foreground">
          Choose one or more CI/CD systems you want HealOps to monitor
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {PROVIDER_TYPES.map((type) => {
          const meta = PROVIDER_META[type];
          const isSelected = selectedTypes.has(type);
          return (
            <button
              key={type}
              onClick={() => toggleProvider(type)}
              className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-all ${
                isSelected
                  ? "border-brand-cyan bg-brand-cyan/5"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20"
              }`}
            >
              <div
                className={`flex size-5 shrink-0 items-center justify-center rounded border mt-0.5 transition-all ${
                  isSelected
                    ? "border-brand-cyan bg-brand-cyan"
                    : "border-white/20"
                }`}
              >
                {isSelected && <Check className="size-3 text-black" />}
              </div>
              <div>
                <p className="text-sm font-semibold">{meta.name}</p>
                <p className="text-xs text-muted-foreground">{meta.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Provider-specific config forms for each selected provider */}
      {selected.map((entry) => (
        <div key={entry.type} className="space-y-3">
          <p className="text-sm font-semibold text-brand-cyan">
            {PROVIDER_META[entry.type].name} Configuration
          </p>

          {entry.type === "github" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-brand-cyan/20 bg-brand-cyan/5 p-4">
                <p className="text-sm">
                  Click the button below to install the HealOps GitHub App on your
                  organization. The Installation ID will be captured automatically.
                </p>
                <a
                  href={`https://github.com/apps/healops-dev/installations/new`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-cyan px-4 py-2 text-sm font-semibold text-black transition-all hover:bg-brand-cyan/90"
                >
                  Install GitHub App
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Installation ID
                  <span className="ml-1 text-xs text-muted-foreground">(from GitHub redirect or App settings)</span>
                </label>
                <input
                  type="text"
                  value={getConfig("github").githubInstallationId ?? ""}
                  onChange={(e) => setConfig("github", "githubInstallationId", e.target.value)}
                  placeholder="e.g. 12345678"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
                />
              </div>
            </div>
          )}

          {entry.type === "gitlab" && (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  GitLab Server URL
                </label>
                <input
                  type="url"
                  value={getConfig("gitlab").serverUrl ?? ""}
                  onChange={(e) => setConfig("gitlab", "serverUrl", e.target.value)}
                  placeholder="https://gitlab.com"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Project Access Token
                </label>
                <input
                  type="password"
                  value={getConfig("gitlab").accessToken ?? ""}
                  onChange={(e) => setConfig("gitlab", "accessToken", e.target.value)}
                  placeholder="glpat-xxxxxxxxxxxx"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
                />
              </div>
            </div>
          )}

          {entry.type === "bitbucket" && (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Workspace
                </label>
                <input
                  type="text"
                  value={getConfig("bitbucket").workspace ?? ""}
                  onChange={(e) => setConfig("bitbucket", "workspace", e.target.value)}
                  placeholder="my-workspace"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  App Password
                </label>
                <input
                  type="password"
                  value={getConfig("bitbucket").appPassword ?? ""}
                  onChange={(e) => setConfig("bitbucket", "appPassword", e.target.value)}
                  placeholder="ATBBxxxxxxxx"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
                />
              </div>
            </div>
          )}

          {entry.type === "jenkins" && (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Jenkins Server URL
                </label>
                <input
                  type="url"
                  value={getConfig("jenkins").serverUrl ?? ""}
                  onChange={(e) => setConfig("jenkins", "serverUrl", e.target.value)}
                  placeholder="https://jenkins.example.com"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  API Token
                </label>
                <input
                  type="password"
                  value={getConfig("jenkins").apiToken ?? ""}
                  onChange={(e) => setConfig("jenkins", "apiToken", e.target.value)}
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Username
                </label>
                <input
                  type="text"
                  value={getConfig("jenkins").username ?? ""}
                  onChange={(e) => setConfig("jenkins", "username", e.target.value)}
                  placeholder="admin"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
                />
              </div>
            </div>
          )}
        </div>
      ))}

      {selected.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selected.length} provider{selected.length === 1 ? "" : "s"} selected
        </p>
      )}
    </div>
  );
}
