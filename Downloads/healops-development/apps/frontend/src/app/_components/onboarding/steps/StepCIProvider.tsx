"use client";

import { GitBranch, ExternalLink } from "lucide-react";
import type { OnboardingData } from "@/app/_libs/types/onboarding";

interface Props {
  data: Partial<OnboardingData>;
  onUpdate: (patch: Partial<OnboardingData>) => void;
}

type ProviderType = "github" | "gitlab" | "bitbucket" | "jenkins";

const providers: {
  type: ProviderType;
  name: string;
  description: string;
}[] = [
  {
    type: "github",
    name: "GitHub Actions",
    description: "Install the HealOps GitHub App for automated access",
  },
  {
    type: "gitlab",
    name: "GitLab CI/CD",
    description: "Connect via project access token",
  },
  {
    type: "bitbucket",
    name: "Bitbucket Pipelines",
    description: "Connect via app password and workspace",
  },
  {
    type: "jenkins",
    name: "Jenkins",
    description: "Connect via API token and server URL",
  },
];

export function StepCIProvider({ data, onUpdate }: Props) {
  const selected = data.ciProvider?.type ?? null;
  const config = data.ciProvider?.config ?? {};

  const setProvider = (type: ProviderType) => {
    onUpdate({ ciProvider: { type, config: {} } });
  };

  const setConfig = (key: string, value: string) => {
    if (!selected) return;
    onUpdate({
      ciProvider: { type: selected, config: { ...config, [key]: value } },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Select your CI provider</h2>
        <p className="text-sm text-muted-foreground">
          Choose the CI/CD system you want HealOps to monitor
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {providers.map((p) => (
          <button
            key={p.type}
            onClick={() => setProvider(p.type)}
            className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-all ${
              selected === p.type
                ? "border-brand-cyan bg-brand-cyan/5"
                : "border-white/10 bg-white/[0.02] hover:border-white/20"
            }`}
          >
            <GitBranch
              className={`mt-0.5 size-5 shrink-0 ${
                selected === p.type ? "text-brand-cyan" : "text-muted-foreground"
              }`}
            />
            <div>
              <p className="text-sm font-semibold">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.description}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Provider-specific config */}
      {selected === "github" && (
        <div className="rounded-lg border border-brand-cyan/20 bg-brand-cyan/5 p-4">
          <p className="text-sm">
            Click the button below to install the HealOps GitHub App on your
            organization.
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
      )}

      {selected === "gitlab" && (
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              GitLab Server URL
            </label>
            <input
              type="url"
              value={config.serverUrl ?? ""}
              onChange={(e) => setConfig("serverUrl", e.target.value)}
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
              value={config.accessToken ?? ""}
              onChange={(e) => setConfig("accessToken", e.target.value)}
              placeholder="glpat-xxxxxxxxxxxx"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
            />
          </div>
        </div>
      )}

      {selected === "bitbucket" && (
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Workspace
            </label>
            <input
              type="text"
              value={config.workspace ?? ""}
              onChange={(e) => setConfig("workspace", e.target.value)}
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
              value={config.appPassword ?? ""}
              onChange={(e) => setConfig("appPassword", e.target.value)}
              placeholder="ATBBxxxxxxxx"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
            />
          </div>
        </div>
      )}

      {selected === "jenkins" && (
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Jenkins Server URL
            </label>
            <input
              type="url"
              value={config.serverUrl ?? ""}
              onChange={(e) => setConfig("serverUrl", e.target.value)}
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
              value={config.apiToken ?? ""}
              onChange={(e) => setConfig("apiToken", e.target.value)}
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
              value={config.username ?? ""}
              onChange={(e) => setConfig("username", e.target.value)}
              placeholder="admin"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
            />
          </div>
        </div>
      )}
    </div>
  );
}
