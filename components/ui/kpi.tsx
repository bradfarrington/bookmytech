import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

// Small dashboard stat tile. Lives at the top of admin list pages — see the
// pattern note in docs/01-architecture.md (or 03-design-system.md). 4-up grid
// on lg, 2-up on smaller screens.

export type KPIDeltaTone = "success" | "error" | "neutral";

export interface KPIProps {
  label: string;
  value: string | number;
  /** Optional small footnote rendered under the value. */
  delta?: string;
  /** Colour the delta string. Defaults to neutral. */
  deltaTone?: KPIDeltaTone;
  /** Optional Lucide icon component rendered top-right in a tinted square. */
  icon?: LucideIcon;
  className?: string;
}

const DELTA_TONE: Record<KPIDeltaTone, string> = {
  success: "text-green-700",
  error: "text-red-700",
  neutral: "text-text-muted",
};

export function KPI({
  label,
  value,
  delta,
  deltaTone = "neutral",
  icon,
  className,
}: KPIProps) {
  return (
    <Card className={cn("p-[18px]", className)}>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="text-xs font-medium text-text-muted">{label}</div>
        {icon && (
          <div className="flex size-7 items-center justify-center rounded-lg bg-blue-50">
            <Icon icon={icon} size={14} className="text-brand-blue" />
          </div>
        )}
      </div>
      <div className="text-[26px] font-bold leading-none tracking-tight text-text-primary">
        {value}
      </div>
      {delta && (
        <div className={cn("mt-2 text-xs font-semibold", DELTA_TONE[deltaTone])}>
          {delta}
        </div>
      )}
    </Card>
  );
}
