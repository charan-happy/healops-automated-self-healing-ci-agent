"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Save, MessageSquare, Mail, Loader2 } from "lucide-react";
import {
  fetchNotificationSettings,
  updateNotificationSettings,
  isDemoMode,
} from "@/app/_libs/healops-api";

interface NotificationChannel {
  id: string;
  channel: "slack" | "email";
  label: string;
  icon: typeof Bell;
  enabled: boolean;
  config: Record<string, string>;
}

const EVENT_KEYS = [
  "jobCompleted",
  "jobFailed",
  "prCreated",
  "escalation",
  "usageLimitWarning",
] as const;

export default function NotificationsPage() {
  const [channels, setChannels] = useState<NotificationChannel[]>([
    {
      id: "slack",
      channel: "slack",
      label: "Slack",
      icon: MessageSquare,
      enabled: false,
      config: { webhookUrl: "" },
    },
    {
      id: "email",
      channel: "email",
      label: "Email",
      icon: Mail,
      enabled: true,
      config: { recipients: "" },
    },
  ]);

  const [events, setEvents] = useState<Record<string, boolean>>({
    jobCompleted: true,
    jobFailed: true,
    prCreated: true,
    escalation: true,
    usageLimitWarning: false,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showMessage = useCallback((type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }, []);

  useEffect(() => {
    async function load() {
      if (isDemoMode()) {
        setLoading(false);
        return;
      }
      const settings = await fetchNotificationSettings();
      if (settings && settings.length > 0) {
        setChannels((prev) =>
          prev.map((ch) => {
            const match = settings.find((s) => s.channel === ch.channel);
            if (!match) return ch;
            return {
              ...ch,
              enabled: match.isActive,
              config: (match.config as Record<string, string>) ?? ch.config,
            };
          }),
        );
        // Restore events from first setting that has them
        const firstEvents = settings[0]?.events as string[] | undefined;
        if (firstEvents) {
          const restored: Record<string, boolean> = {};
          for (const key of EVENT_KEYS) {
            restored[key] = firstEvents.includes(key);
          }
          setEvents(restored);
        }
      }
      setLoading(false);
    }
    void load();
  }, []);

  const toggleChannel = (id: string) => {
    setChannels((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)),
    );
  };

  const updateConfig = (id: string, key: string, value: string) => {
    setChannels((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, config: { ...c.config, [key]: value } } : c,
      ),
    );
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    if (isDemoMode()) {
      await new Promise((r) => setTimeout(r, 500));
      setSaving(false);
      showMessage("success", "Notification preferences saved (demo)");
      return;
    }
    const enabledEvents = Object.entries(events)
      .filter(([, v]) => v)
      .map(([k]) => k);

    const result = await updateNotificationSettings({
      channels: channels.map((ch) => ({
        channel: ch.channel,
        enabled: ch.enabled,
        config: ch.config,
      })),
      events: enabledEvents,
    });
    setSaving(false);
    if (result) {
      showMessage("success", "Notification preferences saved");
    } else {
      showMessage("error", "Failed to save notification preferences");
    }
  }, [channels, events, showMessage]);

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
        <h2 className="text-xl font-bold">Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Configure how you want to be notified about repair events
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

      {/* Channels */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h3 className="mb-4 text-sm font-semibold">Channels</h3>
        <div className="space-y-4">
          {channels.map((ch) => {
            const Icon = ch.icon;
            return (
              <div key={ch.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{ch.label}</span>
                  </div>
                  <button
                    onClick={() => toggleChannel(ch.id)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all ${
                      ch.enabled ? "bg-brand-cyan" : "bg-white/10"
                    }`}
                  >
                    <span
                      className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
                        ch.enabled ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
                {ch.enabled && ch.channel === "slack" && (
                  <input
                    type="url"
                    value={ch.config.webhookUrl ?? ""}
                    onChange={(e) =>
                      updateConfig(ch.id, "webhookUrl", e.target.value)
                    }
                    placeholder="https://hooks.slack.com/services/..."
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
                  />
                )}
                {ch.enabled && ch.channel === "email" && (
                  <input
                    type="text"
                    value={ch.config.recipients ?? ""}
                    onChange={(e) =>
                      updateConfig(ch.id, "recipients", e.target.value)
                    }
                    placeholder="team@example.com, ops@example.com"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Events */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h3 className="mb-4 text-sm font-semibold">Events</h3>
        <div className="space-y-3">
          {Object.entries(events).map(([key, enabled]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm capitalize text-muted-foreground">
                {key.replace(/([A-Z])/g, " $1").trim()}
              </span>
              <button
                onClick={() =>
                  setEvents((prev) => ({ ...prev, [key]: !prev[key] }))
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all ${
                  enabled ? "bg-brand-cyan" : "bg-white/10"
                }`}
              >
                <span
                  className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
                    enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-brand-cyan px-4 py-2 text-sm font-semibold text-black transition-all hover:bg-brand-cyan/90 disabled:opacity-50"
      >
        {saving ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Save className="size-3.5" />
        )}
        Save Preferences
      </button>
    </div>
  );
}
