"use client";

import { useRepairEvents, type RepairEvent } from "@/app/hooks/useRepairEvents";
import {
  Brain,
  Search,
  Code2,
  ShieldCheck,
  GitPullRequest,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react";
import { useState } from "react";

const STAGE_CONFIG: Record<string, { icon: typeof Brain; label: string; color: string }> = {
  gatherContext: { icon: Search, label: "Gathering Context", color: "text-sky-400" },
  classify: { icon: Brain, label: "Classifying Error", color: "text-violet-400" },
  searchSimilar: { icon: Search, label: "Searching Similar Fixes", color: "text-amber-400" },
  generateFix: { icon: Code2, label: "Generating Fix", color: "text-brand-cyan" },
  qualityGate: { icon: ShieldCheck, label: "Quality Gate Check", color: "text-emerald-400" },
  preCheck: { icon: ShieldCheck, label: "Pre-Check Compilation", color: "text-emerald-400" },
  pushBranch: { icon: GitPullRequest, label: "Pushing Branch", color: "text-blue-400" },
  createPR: { icon: GitPullRequest, label: "Creating Pull Request", color: "text-brand-cyan" },
};

function EventItem({ event }: { event: RepairEvent }) {
  if (event.type === "started") {
    return (
      <div className="flex items-center gap-2 text-xs">
        <Loader2 className="size-3.5 shrink-0 animate-spin text-brand-cyan" />
        <span className="text-foreground font-medium">Repair started</span>
        <span className="text-muted-foreground">{event.jobId.slice(0, 8)}</span>
        <span className="ml-auto text-muted-foreground/60">
          {new Date(event.timestamp).toLocaleTimeString()}
        </span>
      </div>
    );
  }

  if (event.type === "stage") {
    const config = STAGE_CONFIG[event.stage ?? ""] ?? { icon: Brain, label: event.stage ?? "Processing", color: "text-muted-foreground" };
    const Icon = config.icon;
    return (
      <div className="flex items-center gap-2 text-xs">
        <Icon className={`size-3.5 shrink-0 ${config.color}`} />
        <span className="text-foreground">{config.label}</span>
        {event.message && (
          <span className="truncate text-muted-foreground">{event.message}</span>
        )}
        {event.progress != null && (
          <span className="ml-auto shrink-0 text-muted-foreground/60">{event.progress}%</span>
        )}
      </div>
    );
  }

  if (event.type === "completed") {
    return (
      <div className="flex items-center gap-2 text-xs">
        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />
        <span className="font-medium text-emerald-400">Fix completed</span>
        {event.prUrl && (
          <a href={event.prUrl} target="_blank" rel="noopener noreferrer" className="text-brand-cyan hover:underline">
            View PR
          </a>
        )}
        <span className="ml-auto text-muted-foreground/60">
          {new Date(event.timestamp).toLocaleTimeString()}
        </span>
      </div>
    );
  }

  if (event.type === "failed") {
    return (
      <div className="flex items-center gap-2 text-xs">
        <XCircle className="size-3.5 shrink-0 text-red-400" />
        <span className="font-medium text-red-400">Fix failed</span>
        {event.reason && <span className="truncate text-muted-foreground">{event.reason}</span>}
      </div>
    );
  }

  if (event.type === "escalated") {
    return (
      <div className="flex items-center gap-2 text-xs">
        <AlertTriangle className="size-3.5 shrink-0 text-orange-400" />
        <span className="font-medium text-orange-400">Escalated to team</span>
      </div>
    );
  }

  return null;
}

export function LiveRepairStream() {
  const { events, currentStage, progress, connected } = useRepairEvents();
  const [expanded, setExpanded] = useState(true);

  const hasActiveRepair = currentStage !== null;
  const recentEvents = events.slice(-15);

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-accent/5"
      >
        <div className="flex items-center gap-2">
          {hasActiveRepair ? (
            <Loader2 className="size-4 animate-spin text-brand-cyan" />
          ) : (
            <Brain className="size-4 text-muted-foreground" />
          )}
          <h3 className="text-sm font-semibold">Agent Activity</h3>
        </div>

        {hasActiveRepair && (
          <div className="flex flex-1 items-center gap-3">
            <div className="h-1.5 flex-1 max-w-xs rounded-full bg-muted/50">
              <div
                className="h-full rounded-full bg-brand-cyan transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{progress}%</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {connected ? (
            <Wifi className="size-3 text-emerald-400" />
          ) : (
            <WifiOff className="size-3 text-red-400" />
          )}
          {expanded ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Event stream */}
      {expanded && (
        <div className="border-t border-border/20 px-5 py-3">
          {recentEvents.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
              <Clock className="size-3.5" />
              <span>Waiting for repair jobs... The agent will show its thinking here in real-time when a pipeline failure is detected.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {recentEvents.map((event, i) => (
                <EventItem key={`${event.jobId}-${event.type}-${i}`} event={event} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
