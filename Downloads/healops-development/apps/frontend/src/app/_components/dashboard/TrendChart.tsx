"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendDataPoint } from "@/app/_libs/types/dashboard";

interface TrendChartProps {
  data: TrendDataPoint[] | null;
  loading?: boolean;
  onPeriodChange?: (period: "7d" | "30d" | "90d") => void;
}

const periods = [
  { label: "7D", value: "7d" as const },
  { label: "30D", value: "30d" as const },
  { label: "90D", value: "90d" as const },
];

export function TrendChart({ data, loading, onPeriodChange }: TrendChartProps) {
  const [activePeriod, setActivePeriod] = useState<"7d" | "30d" | "90d">(
    "30d",
  );

  const handlePeriodChange = (period: "7d" | "30d" | "90d") => {
    setActivePeriod(period);
    onPeriodChange?.(period);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Repair Trends</h3>
          <p className="text-sm text-muted-foreground">
            Fixes and success rate over time
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-white/5 p-1">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePeriodChange(p.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                activePeriod === p.value
                  ? "bg-brand-cyan/20 text-brand-cyan"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading || !data ? (
        <div className="h-64 animate-pulse rounded-lg bg-white/5" />
      ) : (
        <ResponsiveContainer width="100%" height={340}>
          <AreaChart
            data={data}
            margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="gradFixes" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00BCD4" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00BCD4" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradSuccess" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.05)"
            />
            <XAxis
              dataKey="date"
              tick={{ fill: "#888", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: "#888", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              tick={{ fill: "#888", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(20,20,30,0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="fixes"
              stroke="#00BCD4"
              fill="url(#gradFixes)"
              strokeWidth={2}
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="successRate"
              stroke="#10B981"
              fill="url(#gradSuccess)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
