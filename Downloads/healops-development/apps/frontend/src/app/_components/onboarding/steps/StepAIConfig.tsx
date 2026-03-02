"use client";

import { Bot, Cloud, Server } from "lucide-react";
import type { OnboardingData } from "@/app/_libs/types/onboarding";

interface Props {
  data: Partial<OnboardingData>;
  onUpdate: (patch: Partial<OnboardingData>) => void;
}

type AIProvider = "claude" | "openai" | "openrouter" | "local";

const aiProviders: {
  type: AIProvider;
  name: string;
  description: string;
  icon: typeof Bot;
}[] = [
  {
    type: "claude",
    name: "Claude (Anthropic)",
    description: "Best for code analysis and repair. Recommended.",
    icon: Bot,
  },
  {
    type: "openai",
    name: "OpenAI",
    description: "GPT-4o for code generation and analysis",
    icon: Cloud,
  },
  {
    type: "openrouter",
    name: "OpenRouter",
    description: "Access multiple models through a unified API",
    icon: Cloud,
  },
  {
    type: "local",
    name: "Local LLM",
    description: "Use Ollama, LM Studio, vLLM, or any OpenAI-compatible endpoint",
    icon: Server,
  },
];

export function StepAIConfig({ data, onUpdate }: Props) {
  const selected = data.aiConfig?.provider ?? null;
  const config = data.aiConfig?.config ?? {};

  const setProvider = (type: AIProvider) => {
    onUpdate({ aiConfig: { provider: type, config: {} } });
  };

  const setConfig = (key: string, value: string) => {
    if (!selected) return;
    onUpdate({
      aiConfig: { provider: selected, config: { ...config, [key]: value } },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Configure AI provider</h2>
        <p className="text-sm text-muted-foreground">
          Choose the LLM that will analyze failures and generate fixes
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {aiProviders.map((p) => {
          const Icon = p.icon;
          return (
            <button
              key={p.type}
              onClick={() => setProvider(p.type)}
              className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-all ${
                selected === p.type
                  ? "border-brand-cyan bg-brand-cyan/5"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20"
              }`}
            >
              <Icon
                className={`mt-0.5 size-5 shrink-0 ${
                  selected === p.type
                    ? "text-brand-cyan"
                    : "text-muted-foreground"
                }`}
              />
              <div>
                <p className="text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Provider-specific configuration */}
      {selected === "claude" && (
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Anthropic API Key
          </label>
          <input
            type="password"
            value={config.apiKey ?? ""}
            onChange={(e) => setConfig("apiKey", e.target.value)}
            placeholder="sk-ant-xxxxxxxx"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
          />
        </div>
      )}

      {selected === "openai" && (
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            OpenAI API Key
          </label>
          <input
            type="password"
            value={config.apiKey ?? ""}
            onChange={(e) => setConfig("apiKey", e.target.value)}
            placeholder="sk-xxxxxxxx"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
          />
        </div>
      )}

      {selected === "openrouter" && (
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            OpenRouter API Key
          </label>
          <input
            type="password"
            value={config.apiKey ?? ""}
            onChange={(e) => setConfig("apiKey", e.target.value)}
            placeholder="sk-or-xxxxxxxx"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
          />
        </div>
      )}

      {selected === "local" && (
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Base URL
            </label>
            <input
              type="url"
              value={config.baseUrl ?? ""}
              onChange={(e) => setConfig("baseUrl", e.target.value)}
              placeholder="http://localhost:11434/v1"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Supports Ollama, LM Studio, vLLM, or any OpenAI-compatible endpoint
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Model name
            </label>
            <input
              type="text"
              value={config.model ?? ""}
              onChange={(e) => setConfig("model", e.target.value)}
              placeholder="llama3"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
            />
          </div>
        </div>
      )}
    </div>
  );
}
