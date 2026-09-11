"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Tab strip for the two parts views (Task 42). Route-based, following
// sms-tabs.tsx — there is no Tabs primitive in this design system.
//
// Rendered by the two LIST pages only, not by a layout: a layout would put the
// strip on /new, /[id]/edit and /import too, where it makes no sense.

const TABS = [
  { href: "/admin/parts", label: "Live supplier lookup" },
  { href: "/admin/parts/manual", label: "Manual catalogue" },
];

export function PartsTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-border">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition",
              active
                ? "border-brand-blue text-brand-blue"
                : "border-transparent text-text-muted hover:text-text-primary",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
