import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { formatPrice } from "@/lib/utils";

export interface RankedRow {
  id: string;
  label: string;
  /** Primary metric — GMV in pence. */
  gmvPence: number;
  /** Optional secondary line (e.g. "4.8★ · 12 jobs"). */
  meta?: string;
}

// Generic ranked board used for both "Top areas" and "Top mechanics". Bars are
// sized relative to the leader so the ranking reads at a glance.
export function RankedList({
  title,
  icon,
  rows,
  emptyLabel,
}: {
  title: string;
  icon: LucideIcon;
  rows: RankedRow[];
  emptyLabel: string;
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.gmvPence), 0) || 1;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <Icon icon={icon} size={16} className="text-brand-blue" />
        <h2 className="text-sm font-bold tracking-tight text-text-primary">
          {title}
        </h2>
      </div>

      {rows.length > 0 ? (
        <ol className="space-y-3">
          {rows.map((row, i) => (
            <li key={row.id} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="text-xs font-bold tabular-nums text-text-muted">
                    {i + 1}
                  </span>
                  <span className="truncate text-sm font-semibold text-text-primary">
                    {row.label}
                  </span>
                  {row.meta && (
                    <span className="shrink-0 text-xs text-text-muted">
                      {row.meta}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-text-primary">
                  {formatPrice(row.gmvPence)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-brand-blue"
                  style={{ width: `${Math.max(4, (row.gmvPence / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-8 text-center text-sm text-text-muted">{emptyLabel}</p>
      )}
    </Card>
  );
}
