"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatPrice } from "@/lib/utils";

const BRAND_BLUE = "#2563EB";
const MUTED = "#94A3B8";

export interface GmvTrendDatum {
  /** Bucket label for the current period (e.g. "3 Jun" or "w/c 2 Jun"). */
  label: string;
  /** Current-period GMV in pence. */
  current: number;
  /** Aligned prior-period GMV in pence (null past the prior series length). */
  prior: number | null;
}

function shortPounds(pence: number): string {
  const pounds = pence / 100;
  if (pounds >= 1000) return `£${(pounds / 1000).toFixed(pounds >= 10000 ? 0 : 1)}k`;
  return `£${Math.round(pounds)}`;
}

export function GmvTrendChart({ data }: { data: GmvTrendDatum[] }) {
  const hasAny = data.some((d) => d.current > 0 || (d.prior ?? 0) > 0);

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <TrendingUp size={16} className="text-brand-blue" />
        <h2 className="text-sm font-bold tracking-tight text-text-primary">
          GMV trend
        </h2>
        <span className="text-xs text-text-muted">current vs previous period</span>
      </div>

      {hasAny ? (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
            <CartesianGrid stroke="#F1F5F9" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "#64748B" }}
              minTickGap={24}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fontSize: 11, fill: "#64748B" }}
              tickFormatter={(v) => shortPounds(Number(v))}
            />
            <Tooltip
              formatter={(value, name) => [
                formatPrice(Number(value)),
                name === "current" ? "This period" : "Previous",
              ]}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid #E2E8F0",
                fontSize: 12,
              }}
            />
            <Legend
              verticalAlign="top"
              align="right"
              height={24}
              iconType="plainline"
              formatter={(value) =>
                value === "current" ? "This period" : "Previous"
              }
              wrapperStyle={{ fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="prior"
              stroke={MUTED}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="current"
              stroke={BRAND_BLUE}
              strokeWidth={2.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="py-12 text-center text-sm text-text-muted">
          No revenue in this period yet.
        </p>
      )}
    </Card>
  );
}
