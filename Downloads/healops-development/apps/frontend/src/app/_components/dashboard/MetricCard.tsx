"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  trend: number;
  icon: LucideIcon;
  format?: "number" | "percent" | "currency" | "duration";
  index?: number;
}

function formatValue(
  value: string | number,
  format: MetricCardProps["format"],
): string {
  if (typeof value === "string") return value;
  switch (format) {
    case "percent":
      return `${value.toFixed(1)}%`;
    case "currency":
      return `$${value.toLocaleString()}`;
    case "duration":
      return value < 60
        ? `${value}s`
        : `${Math.floor(value / 60)}m ${value % 60}s`;
    default:
      return value.toLocaleString();
  }
}

export function MetricCard({
  title,
  value,
  trend,
  icon: Icon,
  format = "number",
  index = 0,
}: MetricCardProps) {
  const isPositive = trend >= 0;
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.4 }}
      className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl transition-all hover:border-white/20 hover:bg-white/[0.07]"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold tracking-tight">
            {formatValue(value, format)}
          </p>
        </div>
        <div className="rounded-lg bg-brand-cyan/10 p-2.5">
          <Icon className="size-5 text-brand-cyan" />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <TrendIcon
          className={`size-3.5 ${isPositive ? "text-emerald-400" : "text-red-400"}`}
        />
        <span
          className={`text-sm font-medium ${isPositive ? "text-emerald-400" : "text-red-400"}`}
        >
          {isPositive ? "+" : ""}
          {trend.toFixed(1)}%
        </span>
        <span className="text-xs text-muted-foreground">vs last period</span>
      </div>

      <div className="absolute -right-4 -top-4 size-24 rounded-full bg-brand-cyan/5 blur-2xl transition-all group-hover:bg-brand-cyan/10" />
    </motion.div>
  );
}
