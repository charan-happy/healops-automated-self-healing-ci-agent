"use client";

import {
  Building2,
  GitBranch,
  FolderGit2,
  Bot,
  CheckCircle2,
  Code2,
} from "lucide-react";
import type { OnboardingData } from "@/app/_libs/types/onboarding";

interface Props {
  data: Partial<OnboardingData>;
}

export function StepReview({ data }: Props) {
  const sections = [
    {
      icon: Building2,
      title: "Organization",
      value: data.organization?.name || "Not configured",
      detail: data.organization?.teamSize
        ? `Team size: ${data.organization.teamSize}`
        : null,
    },
    {
      icon: GitBranch,
      title: "CI Provider",
      value: data.ciProviders?.length
        ? data.ciProviders.map((p) => p.type.charAt(0).toUpperCase() + p.type.slice(1)).join(", ")
        : data.ciProvider?.type
          ? data.ciProvider.type.charAt(0).toUpperCase() + data.ciProvider.type.slice(1)
          : "Not selected",
      detail: null,
    },
    {
      icon: Code2,
      title: "SCM Provider",
      value: data.scmProviders?.length
        ? data.scmProviders.map((p) => p.type.charAt(0).toUpperCase() + p.type.slice(1)).join(", ")
        : "Skipped",
      detail: null,
    },
    {
      icon: FolderGit2,
      title: "Repositories",
      value: data.repositories?.length
        ? `${data.repositories.length} repositor${data.repositories.length === 1 ? "y" : "ies"}`
        : "None selected",
      detail: data.repositories
        ?.map((r) => r.name)
        .join(", "),
    },
    {
      icon: Bot,
      title: "AI Provider",
      value: data.aiConfig?.provider
        ? data.aiConfig.provider.charAt(0).toUpperCase() +
          data.aiConfig.provider.slice(1)
        : "Not configured",
      detail: null,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Review your configuration</h2>
        <p className="text-sm text-muted-foreground">
          Confirm everything looks good before activating HealOps
        </p>
      </div>

      <div className="space-y-3">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.title}
              className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4"
            >
              <div className="rounded-md bg-brand-cyan/10 p-2">
                <Icon className="size-4 text-brand-cyan" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {s.title}
                </p>
                <p className="text-sm font-semibold">{s.value}</p>
                {s.detail && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {s.detail}
                  </p>
                )}
              </div>
              {s.value !== "Not configured" &&
                s.value !== "Not selected" &&
                s.value !== "None selected" &&
                s.value !== "Skipped" && (
                  <CheckCircle2 className="mt-0.5 size-4 text-emerald-400" />
                )}
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-brand-cyan/20 bg-brand-cyan/5 p-4">
        <p className="text-sm">
          When activated, HealOps will begin monitoring your selected
          repositories for pipeline failures and automatically attempt repairs.
        </p>
      </div>
    </div>
  );
}
