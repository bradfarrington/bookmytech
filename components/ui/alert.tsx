import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";

// A notice box for forms and flows (Task 47): errors, warnings, confirmations
// and information. Replaces the hand-rolled `rounded-lg bg-*-50 px-4 py-3`
// boxes the booking funnel repeated. Warnings and errors are announced.

type Tone = "info" | "success" | "warning" | "error";

const TONES: Record<Tone, { box: string; icon: LucideIcon; iconClass: string }> = {
  info: { box: "border-blue-100 bg-blue-50 text-brand-blue-dark", icon: Info, iconClass: "text-brand-blue" },
  success: { box: "border-green-100 bg-green-50 text-green-800", icon: CheckCircle2, iconClass: "text-success" },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: AlertTriangle, iconClass: "text-amber-600" },
  error: { box: "border-red-100 bg-red-50 text-red-700", icon: XCircle, iconClass: "text-danger" },
};

export interface AlertProps {
  tone?: Tone;
  /** Bold first line. */
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** Override the tone's icon, or `null` for none. */
  icon?: LucideIcon | null;
  className?: string;
}

export function Alert({ tone = "info", title, children, icon, className }: AlertProps) {
  const style = TONES[tone];
  const IconComponent = icon === null ? null : (icon ?? style.icon);
  return (
    <div
      role={tone === "error" || tone === "warning" ? "alert" : undefined}
      className={cn("flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm leading-[1.5]", style.box, className)}
    >
      {IconComponent && (
        <Icon icon={IconComponent} size={17} strokeWidth={2} className={cn("mt-0.5 shrink-0", style.iconClass)} />
      )}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5" : undefined}>{children}</div>}
      </div>
    </div>
  );
}
