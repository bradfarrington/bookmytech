"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/sms", label: "Overview" },
  { href: "/admin/sms/templates", label: "Templates" },
  { href: "/admin/sms/logs", label: "Logs" },
];

export function SmsTabs() {
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
