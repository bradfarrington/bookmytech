import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

export interface MechanicPlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  /** Which later task/stage delivers this page — shown as a small note. */
  comingIn?: string;
}

// Shared "Coming soon" composite for mechanic nav items not yet built. Mirrors
// the admin PlaceholderPage pattern.
export function MechanicPlaceholderPage({
  title,
  description,
  icon,
  comingIn,
}: MechanicPlaceholderProps) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <Card className="flex flex-col items-center gap-4 p-10 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-blue-50">
          <Icon icon={icon} size={26} className="text-brand-blue" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          {title}
        </h1>
        <p className="max-w-sm leading-relaxed text-text-secondary">
          {description}
        </p>
        {comingIn && (
          <p className="rounded-full bg-border-subtle px-3 py-1 text-xs font-semibold text-text-muted">
            {comingIn}
          </p>
        )}
      </Card>
    </div>
  );
}
