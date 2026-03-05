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
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.1, duration: 0.4, ease: "easeOut" }}
      className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-card/50 p-6 backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-cyan/20 hover:shadow-xl hover:shadow-brand-cyan/5"
    >
      {/* Subtle gradient glow on hover */}
      <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-brand-cyan/[0.04] blur-3xl transition-all duration-500 group-hover:bg-brand-cyan/[0.12]" />
      <div className="pointer-events-none absolute -bottom-4 -left-4 size-20 rounded-full bg-brand-primary/[0.03] blur-2xl transition-all duration-500 group-hover:bg-brand-primary/[0.08]" />

      <div className="relative flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
            {title}
          </p>
          <p className="text-3xl font-extrabold tracking-tight">
            {formatValue(value, format)}
          </p>
        </div>
        <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-cyan/15 to-brand-primary/10 ring-1 ring-brand-cyan/10 transition-all group-hover:ring-brand-cyan/25">
          <Icon className="size-5 text-brand-cyan" />
        </div>
      </div>

      <div className="relative mt-4 flex items-center gap-2">
        <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
          isPositive
            ? "bg-emerald-400/10 text-emerald-400"
            : "bg-red-400/10 text-red-400"
        }`}>
          <TrendIcon className="size-3" />
          {isPositive ? "+" : ""}
          {trend.toFixed(1)}%
        </div>
        <span className="text-[11px] text-muted-foreground/60">vs last period</span>
      </div>
    </motion.div>
  );
}
