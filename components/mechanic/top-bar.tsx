import { Bell } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { OnlineToggle } from "@/components/mechanic/online-toggle";

export interface MechanicTopBarProps {
  firstName: string;
  status: "online" | "offline" | "on_job";
}

export function MechanicTopBar({ firstName, status }: MechanicTopBarProps) {
  // Rendered server-side at request time, so the date is stable for hydration.
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <header className="flex h-[72px] shrink-0 items-center gap-4 border-b border-border bg-surface-card px-7">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-muted">
          Mechanic dashboard
        </p>
        <p className="truncate text-lg font-bold tracking-tight text-text-primary">
          Hi {firstName} · {today}
        </p>
      </div>

      <div className="flex-1" />

      <OnlineToggle initialStatus={status} />

      <button
        type="button"
        aria-label="Notifications"
        className="relative flex size-10 items-center justify-center rounded-button border border-border bg-surface text-text-secondary transition-colors hover:bg-border-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
      >
        <Icon icon={Bell} size={15} />
        <span
          aria-hidden
          className="absolute right-2 top-2 size-2 rounded-full border-[1.5px] border-surface-card bg-danger"
        />
      </button>
    </header>
  );
}
