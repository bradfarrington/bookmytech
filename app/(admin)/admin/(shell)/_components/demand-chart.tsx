"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  Tooltip,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/card";

export interface DemandDatum {
  area: string;
  count: number;
  /** Bookings in this area but fewer than 2 online mechanics. */
  undersupplied: boolean;
}

const BRAND_BLUE = "#2563EB";
const AMBER = "#F59E0B";

export function DemandChart({ data }: { data: DemandDatum[] }) {
  const hasAny = data.length > 0;
  const undersuppliedCount = data.filter((d) => d.undersupplied).length;
  // ~34px per row keeps bars comfortably spaced; floor so a single area
  // doesn't collapse the plot area.
  const chartHeight = Math.max(data.length * 34, 80);

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-brand-blue" />
          <h2 className="text-sm font-bold tracking-tight text-text-primary">
            Demand by area
          </h2>
        </div>
        {undersuppliedCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600">
            <span className="size-2 rounded-full bg-amber-500" />
            {undersuppliedCount} undersupplied
          </span>
        )}
      </div>

      {hasAny ? (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
            barCategoryGap={8}
          >
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="area"
              width={64}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fontWeight: 600, fill: "#475569" }}
            />
            <Tooltip
              cursor={{ fill: "#F1F5F9" }}
              formatter={(value) => {
                const n = Number(value);
                return [`${n} booking${n === 1 ? "" : "s"}`, "Demand"];
              }}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid #E2E8F0",
                fontSize: 12,
              }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
              {data.map((d) => (
                <Cell key={d.area} fill={d.undersupplied ? AMBER : BRAND_BLUE} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="py-6 text-center text-sm text-text-muted">
          No bookings to chart yet.
        </p>
      )}
    </Card>
  );
}
