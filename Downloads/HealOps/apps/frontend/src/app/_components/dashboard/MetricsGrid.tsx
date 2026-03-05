"use client";

import { Clock, CheckCircle2, Wrench, DollarSign } from "lucide-react";
import { MetricCard } from "./MetricCard";
import type { DashboardMetrics } from "@/app/_libs/types/dashboard";

interface MetricsGridProps {
  metrics: DashboardMetrics | null;
  loading?: boolean;
}

export function MetricsGrid({ metrics, loading }: MetricsGridProps) {
  if (loading || !metrics) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[140px] animate-pulse rounded-xl border border-white/10 bg-white/5"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        title="Mean Time to Repair"
        value={metrics.mttr}
        trend={metrics.mttrTrend}
        icon={Clock}
        format="duration"
        index={0}
      />
      <MetricCard
        title="Success Rate"
        value={metrics.successRate}
        trend={metrics.successRateTrend}
        icon={CheckCircle2}
        format="percent"
        index={1}
      />
      <MetricCard
        title="Total Fixes"
        value={metrics.totalFixes}
        trend={metrics.totalFixesTrend}
        icon={Wrench}
        format="number"
        index={2}
      />
      <MetricCard
        title="Cost Savings"
        value={metrics.costSavings}
        trend={metrics.costSavingsTrend}
        icon={DollarSign}
        format="currency"
        index={3}
      />
    </div>
  );
}
