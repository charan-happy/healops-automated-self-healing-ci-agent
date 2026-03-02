"use client";

import { useState } from "react";
import { Key, Plus, Trash2, Copy, Check } from "lucide-react";
import type { ApiKey } from "@/app/_libs/types/settings";

const MOCK_KEYS: ApiKey[] = [
  {
    id: "1",
    name: "Production",
    prefix: "ho_live_abc1",
    createdAt: "2024-06-01T00:00:00Z",
    lastUsedAt: "2024-12-01T00:00:00Z",
  },
  {
    id: "2",
    name: "Development",
    prefix: "ho_test_xyz9",
    createdAt: "2024-09-01T00:00:00Z",
    lastUsedAt: null,
  },
];

export default function ApiKeysPage() {
  const [keys] = useState<ApiKey[]>(MOCK_KEYS);
  const [newKeyName, setNewKeyName] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (prefix: string, id: string) => {
    navigator.clipboard.writeText(prefix + "...");
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold">API Keys</h2>
        <p className="text-sm text-muted-foreground">
          Create and manage API keys for programmatic access
        </p>
      </div>

      {/* Create new key */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h3 className="mb-4 text-sm font-semibold">Create New Key</h3>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g., Production)"
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
          />
          <button
            disabled={!newKeyName.trim()}
            className="flex items-center gap-2 rounded-lg bg-brand-cyan px-4 py-2.5 text-sm font-semibold text-black transition-all hover:bg-brand-cyan/90 disabled:opacity-50"
          >
            <Plus className="size-3.5" />
            Create
          </button>
        </div>
      </div>

      {/* Existing keys */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h3 className="mb-4 text-sm font-semibold">Active Keys</h3>
        <div className="space-y-3">
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex items-center gap-4 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3"
            >
              <Key className="size-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{key.name}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono">
                    {key.prefix}...
                  </code>
                  <span>
                    Created {new Date(key.createdAt).toLocaleDateString()}
                  </span>
                  {key.lastUsedAt && (
                    <span>
                      Last used{" "}
                      {new Date(key.lastUsedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleCopy(key.prefix, key.id)}
                className="rounded p-1.5 text-muted-foreground transition-all hover:bg-white/10"
              >
                {copiedId === key.id ? (
                  <Check className="size-3.5 text-emerald-400" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
              <button className="rounded p-1.5 text-muted-foreground transition-all hover:bg-red-400/10 hover:text-red-400">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
