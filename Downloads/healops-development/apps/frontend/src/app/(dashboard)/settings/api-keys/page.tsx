"use client";

import { useCallback, useEffect, useState } from "react";
import { Key, Plus, Trash2, Copy, Check, Loader2 } from "lucide-react";
import {
  fetchApiKeys,
  createApiKey,
  deleteApiKey,
  isDemoMode,
} from "@/app/_libs/healops-api";

interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const DEMO_KEYS: ApiKeyItem[] = [
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
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showMessage = useCallback((type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }, []);

  useEffect(() => {
    async function load() {
      if (isDemoMode()) {
        setKeys(DEMO_KEYS);
        setLoading(false);
        return;
      }
      const result = await fetchApiKeys();
      if (result) setKeys(result);
      setLoading(false);
    }
    void load();
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreate = useCallback(async () => {
    if (!newKeyName.trim()) return;
    if (isDemoMode()) {
      const demoKey: ApiKeyItem = {
        id: `demo-${Date.now()}`,
        name: newKeyName.trim(),
        prefix: `ho_${Math.random().toString(36).slice(2, 10)}`,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      };
      setKeys((prev) => [demoKey, ...prev]);
      setNewKeyName("");
      showMessage("success", "API key created (demo)");
      return;
    }
    setCreating(true);
    const result = await createApiKey(newKeyName.trim());
    setCreating(false);
    if (result) {
      setNewKeyValue(result.key);
      setKeys((prev) => [
        {
          id: result.id,
          name: newKeyName.trim(),
          prefix: result.prefix,
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
        },
        ...prev,
      ]);
      setNewKeyName("");
      showMessage("success", "API key created — copy it now, it won't be shown again");
    } else {
      showMessage("error", "Failed to create API key");
    }
  }, [newKeyName, showMessage]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (isDemoMode()) {
        setKeys((prev) => prev.filter((k) => k.id !== id));
        showMessage("success", "API key revoked (demo)");
        return;
      }
      setDeletingId(id);
      const ok = await deleteApiKey(id);
      setDeletingId(null);
      if (ok) {
        setKeys((prev) => prev.filter((k) => k.id !== id));
        showMessage("success", "API key revoked");
      } else {
        showMessage("error", "Failed to revoke API key");
      }
    },
    [showMessage],
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-brand-cyan" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold">API Keys</h2>
        <p className="text-sm text-muted-foreground">
          Create and manage API keys for programmatic access
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            message.type === "success"
              ? "bg-emerald-400/10 text-emerald-400"
              : "bg-red-400/10 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Show newly created key */}
      {newKeyValue && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-4">
          <p className="mb-2 text-sm font-semibold text-emerald-400">
            Your new API key (copy it now — it won&apos;t be shown again):
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-black/30 px-3 py-2 font-mono text-sm text-emerald-300">
              {newKeyValue}
            </code>
            <button
              onClick={() => handleCopy(newKeyValue, "new")}
              className="rounded-lg bg-emerald-400/10 px-3 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-400/20"
            >
              {copiedId === "new" ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
            </button>
          </div>
          <button
            onClick={() => setNewKeyValue(null)}
            className="mt-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create new key */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h3 className="mb-4 text-sm font-semibold">Create New Key</h3>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
            }}
            placeholder="Key name (e.g., Production)"
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
          />
          <button
            onClick={handleCreate}
            disabled={!newKeyName.trim() || creating}
            className="flex items-center gap-2 rounded-lg bg-brand-cyan px-4 py-2.5 text-sm font-semibold text-black transition-all hover:bg-brand-cyan/90 disabled:opacity-50"
          >
            {creating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            Create
          </button>
        </div>
      </div>

      {/* Existing keys */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h3 className="mb-4 text-sm font-semibold">Active Keys</h3>
        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API keys yet</p>
        ) : (
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
                  onClick={() => handleCopy(key.prefix + "...", key.id)}
                  className="rounded p-1.5 text-muted-foreground transition-all hover:bg-white/10"
                >
                  {copiedId === key.id ? (
                    <Check className="size-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </button>
                <button
                  onClick={() => handleDelete(key.id)}
                  disabled={deletingId === key.id}
                  className="rounded p-1.5 text-muted-foreground transition-all hover:bg-red-400/10 hover:text-red-400 disabled:opacity-50"
                >
                  {deletingId === key.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
