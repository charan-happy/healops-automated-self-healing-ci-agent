"use client";

import { useState } from "react";
import { Bell, Save, MessageSquare, Mail } from "lucide-react";

interface NotificationChannel {
  id: string;
  channel: "slack" | "email";
  label: string;
  icon: typeof Bell;
  enabled: boolean;
  config: Record<string, string>;
}

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

  const [events, setEvents] = useState({
    jobCompleted: true,
    jobFailed: true,
    prCreated: true,
    escalation: true,
    usageLimitWarning: false,
  });

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

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold">Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Configure how you want to be notified about repair events
        </p>
      </div>

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
                  setEvents((prev) => ({
                    ...prev,
                    [key]: !prev[key as keyof typeof prev],
                  }))
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

      <button className="flex items-center gap-2 rounded-lg bg-brand-cyan px-4 py-2 text-sm font-semibold text-black transition-all hover:bg-brand-cyan/90">
        <Save className="size-3.5" />
        Save Preferences
      </button>
    </div>
  );
}
