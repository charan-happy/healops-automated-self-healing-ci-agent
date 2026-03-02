"use client";

import { useState } from "react";
import { Bot, Cloud, Server, Save, Loader2 } from "lucide-react";

type Provider = "claude" | "openai" | "openrouter" | "local";

const providers: { type: Provider; name: string; icon: typeof Bot }[] = [
  { type: "claude", name: "Claude (Anthropic)", icon: Bot },
  { type: "openai", name: "OpenAI", icon: Cloud },
  { type: "openrouter", name: "OpenRouter", icon: Cloud },
  { type: "local", name: "Local LLM", icon: Server },
];

export default function AIConfigPage() {
  const [selected, setSelected] = useState<Provider>("claude");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    // Simulate API test
    await new Promise((r) => setTimeout(r, 2000));
    setTesting(false);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold">AI Configuration</h2>
        <p className="text-sm text-muted-foreground">
          Configure the LLM provider used for code analysis and repair
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h3 className="mb-4 text-sm font-semibold">Select Provider</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {providers.map((p) => {
            const Icon = p.icon;
            return (
              <button
                key={p.type}
                onClick={() => setSelected(p.type)}
                className={`flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-all ${
                  selected === p.type
                    ? "border-brand-cyan bg-brand-cyan/10 text-brand-cyan"
                    : "border-white/10 text-muted-foreground hover:border-white/20"
                }`}
              >
                <Icon className="size-4" />
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-lg rounded-xl border border-white/10 bg-white/5 p-6">
        <h3 className="mb-4 text-sm font-semibold">Provider Settings</h3>
        <div className="space-y-4">
          {selected !== "local" && (
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-xxxxxxxx"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
              />
            </div>
          )}

          {selected === "local" && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Base URL
                </label>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434/v1"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Model
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="llama3"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
                />
              </div>
            </>
          )}

          <div className="flex gap-3">
            <button className="flex items-center gap-2 rounded-lg bg-brand-cyan px-4 py-2 text-sm font-semibold text-black transition-all hover:bg-brand-cyan/90">
              <Save className="size-3.5" />
              Save
            </button>
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-white/5 disabled:opacity-50"
            >
              {testing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Bot className="size-3.5" />
              )}
              Test Connection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
