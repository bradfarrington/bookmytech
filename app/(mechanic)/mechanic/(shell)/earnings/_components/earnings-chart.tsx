"use client";

import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatPrice, cn } from "@/lib/utils";

const BRAND_BLUE = "#2563EB";

export interface EarningsPoint {
  /** ISO date (yyyy-mm-dd) at local midnight. */
  date: string;
  /** Mechanic's share earned that day, in pence. */
  pence: number;
}

type Period = 7 | 30 | 90;

const PERIODS: { value: Period; label: string }[] = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
];

function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

// `series` is the full 90-day daily series (oldest → newest). The selector just
// slices the tail, so switching periods never refetches.
export function EarningsChart({ series }: { series: EarningsPoint[] }) {
  const [period, setPeriod] = useState<Period>(30);

  const data = useMemo(() => series.slice(-period), [series, period]);
  const total = useMemo(() => data.reduce((sum, d) => sum + d.pence, 0), [data]);

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <LineChartIcon size={16} className="text-brand-blue" />
          <h2 className="text-sm font-bold tracking-tight text-text-primary">
            Earnings
          </h2>
          <span className="text-xs text-text-muted">
            {formatPrice(total)} over {period} days
          </span>
        </div>
        <div className="flex gap-1 rounded-button border border-border bg-surface p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className={cn(
                "rounded-[6px] px-2.5 py-1 text-xs font-semibold transition-colors",
                period === p.value
                  ? "bg-surface-card text-brand-blue shadow-sm"
                  : "text-text-muted hover:text-text-secondary",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="earningsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BRAND_BLUE} stopOpacity={0.22} />
              <stop offset="100%" stopColor={BRAND_BLUE} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F6" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={dayLabel}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
            tick={{ fontSize: 11, fill: "#94A3B8" }}
          />
          <YAxis
            tickFormatter={(v) => formatPrice(Number(v)).replace(/\.00$/, "")}
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fontSize: 11, fill: "#94A3B8" }}
          />
          <Tooltip
            formatter={(value) => [formatPrice(Number(value)), "Earned"]}
            labelFormatter={(label) => dayLabel(String(label))}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid #E2E8F0",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="pence"
            stroke={BRAND_BLUE}
            strokeWidth={2}
            fill="url(#earningsFill)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}
