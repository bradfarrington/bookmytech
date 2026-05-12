import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";

export interface TrustBadgeProps {
  icon: LucideIcon;
  value: string;
  label: string;
  className?: string;
}

export function TrustBadge({ icon, value, label, className }: TrustBadgeProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl border border-border bg-surface-card px-3.5 py-2.5",
        className,
      )}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50">
        <Icon icon={icon} size={16} className="text-brand-blue" />
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-bold leading-tight text-text-primary">
          {value}
        </div>
        <div className="text-[11px] text-text-muted">{label}</div>
      </div>
    </div>
  );
}
