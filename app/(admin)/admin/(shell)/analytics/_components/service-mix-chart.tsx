"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { PieChart as PieIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatPrice } from "@/lib/utils";

export interface ServiceMixDatum {
  name: string;
  gmvPence: number;
}

// Brand-led categorical palette for the donut slices.
const PALETTE = [
  "#2563EB",
  "#3B82F6",
  "#60A5FA",
  "#93C5FD",
  "#1E40AF",
  "#0EA5E9",
  "#38BDF8",
  "#A5B4FC",
];

export function ServiceMixChart({ data }: { data: ServiceMixDatum[] }) {
  const total = data.reduce((sum, d) => sum + d.gmvPence, 0);

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <PieIcon size={16} className="text-brand-blue" />
        <h2 className="text-sm font-bold tracking-tight text-text-primary">
          Repair mix
        </h2>
        <span className="text-xs text-text-muted">share of GMV</span>
      </div>

      {total > 0 ? (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="h-[180px] w-[180px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="gmvPence"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={84}
                  paddingAngle={2}
                  stroke="none"
                >
                  {data.map((d, i) => (
                    <Cell key={d.name} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatPrice(Number(value))}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid #E2E8F0",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex-1 space-y-1.5 self-stretch">
            {data.map((d, i) => {
              const pct = Math.round((d.gmvPence / total) * 100);
              return (
                <li
                  key={d.name}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
                  />
                  <span className="flex-1 truncate text-text-secondary">
                    {d.name}
                  </span>
                  <span className="font-semibold tabular-nums text-text-primary">
                    {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="py-12 text-center text-sm text-text-muted">
          No revenue to break down yet.
        </p>
      )}
    </Card>
  );
}
