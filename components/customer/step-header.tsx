import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Icon } from "@/components/ui/icon";

// The heading of a booking step (Task 47): a round Back control, the step's
// title and a line under it. Used by every step so they read alike. Pass
// `backHref` from a server component, or `onBack` from a client one.

export interface StepHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  backHref?: string;
  onBack?: () => void;
}

const BACK_CLASS =
  "mt-1 flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-white text-text-secondary transition-colors hover:border-text-primary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";

export function StepHeader({ title, subtitle, backHref, onBack }: StepHeaderProps) {
  return (
    <div className="flex items-start gap-3">
      {backHref ? (
        <Link href={backHref} aria-label="Back" className={BACK_CLASS}>
          <Icon icon={ArrowLeft} size={18} strokeWidth={2} />
        </Link>
      ) : onBack ? (
        <button type="button" onClick={onBack} aria-label="Back" className={BACK_CLASS}>
          <Icon icon={ArrowLeft} size={18} strokeWidth={2} />
        </button>
      ) : null}
      <div className="min-w-0">
        <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-text-primary sm:text-[30px]">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-[15px] leading-[1.5] text-text-secondary">{subtitle}</p>}
      </div>
    </div>
  );
}
