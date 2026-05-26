"use client";

import { usePathname } from "next/navigation";
import { Bell, ChevronRight, Search } from "lucide-react";
import { Icon } from "@/components/ui/icon";

// Maps a route to its breadcrumb pair: [group, label]. New admin routes need
// adding here so the top-bar can render their crumb. Patterns with `[id]` are
// matched by `/admin/services/{id}/edit` etc. — see `matchCrumb`.
const CRUMBS: Record<string, readonly [string, string]> = {
  "/admin": ["Operations", "Overview"],
  "/admin/jobs": ["Operations", "All jobs"],
  "/admin/live": ["Operations", "Live monitor"],
  "/admin/disputes": ["Operations", "Disputes"],
  "/admin/mechanics": ["Network", "Mechanics"],
  "/admin/mechanics/new": ["Mechanics", "Add mechanic"],
  "/admin/mechanics/[id]": ["Mechanics", "Mechanic detail"],
  "/admin/approvals": ["Network", "Approvals"],
  "/admin/documents": ["Network", "Documents"],
  "/admin/pricing": ["Commercial", "Pricing"],
  "/admin/areas": ["Commercial", "Areas & demand"],
  "/admin/analytics": ["Commercial", "Analytics"],
  "/admin/services": ["Commercial", "Services"],
  "/admin/services/new": ["Services", "New service"],
  "/admin/services/[id]/edit": ["Services", "Edit service"],
  "/admin/services/settings": ["Services", "Settings"],
  "/admin/services/settings/categories/new": ["Settings", "New category"],
  "/admin/services/settings/categories/[id]/edit": [
    "Settings",
    "Edit category",
  ],
};

// Looks up the crumb for a pathname, falling back to a patterned match where
// dynamic segments (UUIDs) are replaced with `[id]`. We only swap a single
// UUID-shaped segment per pathname — sufficient for our routes.
const UUID_RE =
  /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function matchCrumb(pathname: string): readonly [string, string] | null {
  if (CRUMBS[pathname]) return CRUMBS[pathname];
  const patterned = pathname.replace(UUID_RE, "/[id]");
  return CRUMBS[patterned] ?? null;
}

export function AdminTopBar() {
  const pathname = usePathname();
  const crumbs = matchCrumb(pathname);

  return (
    <header className="flex h-[72px] shrink-0 items-center gap-4 border-b border-border bg-surface-card px-7">
      {crumbs && (
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-[13px]"
        >
          <span className="font-medium text-text-muted">{crumbs[0]}</span>
          <Icon icon={ChevronRight} size={12} className="text-text-disabled" />
          <span className="font-bold text-text-primary">{crumbs[1]}</span>
        </nav>
      )}

      <div className="flex-1" />

      <label className="relative w-80 max-w-full">
        <span className="sr-only">Search</span>
        <Icon
          icon={Search}
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="search"
          readOnly
          placeholder="Search bookings, mechanics, customers…"
          className="h-10 w-full rounded-button border border-border bg-surface pl-9 pr-12 text-[13px] text-text-secondary placeholder:text-text-muted focus:outline-none"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-surface-card px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
          ⌘K
        </kbd>
      </label>

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
