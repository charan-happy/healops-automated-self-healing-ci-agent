"use client";

import { Building2 } from "lucide-react";
import type { OnboardingData } from "@/app/_libs/types/onboarding";

interface Props {
  data: Partial<OnboardingData>;
  onUpdate: (patch: Partial<OnboardingData>) => void;
}

const teamSizes = ["1-5", "6-20", "21-50", "51-200", "200+"];

export function StepOrganization({ data, onUpdate }: Props) {
  const org = data.organization ?? { name: "", teamSize: "" };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Create your organization</h2>
        <p className="text-sm text-muted-foreground">
          This is your team workspace for HealOps
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Organization name
          </label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={org.name}
              onChange={(e) =>
                onUpdate({
                  organization: { ...org, name: e.target.value },
                })
              }
              placeholder="Acme Corp"
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50 focus:ring-1 focus:ring-brand-cyan/20"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Team size</label>
          <div className="grid grid-cols-5 gap-2">
            {teamSizes.map((size) => (
              <button
                key={size}
                onClick={() =>
                  onUpdate({
                    organization: { ...org, teamSize: size },
                  })
                }
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                  org.teamSize === size
                    ? "border-brand-cyan bg-brand-cyan/10 text-brand-cyan"
                    : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
