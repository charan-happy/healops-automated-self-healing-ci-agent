"use client";

import { useState } from "react";
import {
  GitBranch,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { CIProviderConfig } from "@/app/_libs/types/settings";

const MOCK_PROVIDERS: CIProviderConfig[] = [
  {
    id: "1",
    providerType: "github",
    displayName: "GitHub (healops-dev)",
    isActive: true,
    createdAt: "2024-01-01T00:00:00Z",
  },
];

export default function CIProvidersPage() {
  const [providers] = useState<CIProviderConfig[]>(MOCK_PROVIDERS);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">CI Providers</h2>
          <p className="text-sm text-muted-foreground">
            Manage connected CI/CD providers
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-brand-cyan px-4 py-2 text-sm font-semibold text-black transition-all hover:bg-brand-cyan/90">
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
              {p.isActive ? (
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
              <button className="rounded p-1.5 text-muted-foreground transition-all hover:bg-red-400/10 hover:text-red-400">
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
    </div>
  );
}
