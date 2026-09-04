"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/avatar";
import { signOut } from "@/app/actions/sign-out";
import {
  MECHANIC_NAV_ITEMS,
  isNavItemActive,
  type MechanicNavBadges,
} from "@/components/mechanic/nav-items";
import { useSidebarCollapsed } from "@/lib/use-sidebar-collapsed";

export interface MechanicSidebarProps {
  userName: string;
  /** Avatar tint index, so different mechanics aren't all the same colour. */
  avatarTint?: number;
  /** Counts beside nav items, keyed by href (Task 25: open disputes). */
  badges?: MechanicNavBadges;
}

// Desktop-only (hidden below md). On narrow viewports the same nav appears in
// the slide-in drawer (components/mechanic/mobile-nav.tsx). Collapsible to an
// icon rail; the collapsed header swaps the wordmark for the favicon.
export function MechanicSidebar({ userName, avatarTint = 0, badges }: MechanicSidebarProps) {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebarCollapsed();

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-border bg-surface-card transition-[width] duration-200 md:flex",
        collapsed ? "w-[72px]" : "w-60",
      )}
    >
      <div className="flex h-[88px] items-center justify-center border-b border-border px-5">
        <Image
          src={collapsed ? "/favicon.png" : "/logo.png"}
          alt="Book My Tech"
          width={collapsed ? 64 : 520}
          height={collapsed ? 64 : 156}
          priority
          className={collapsed ? "size-9 object-contain" : "h-16 w-auto"}
        />
      </div>

      <nav className="flex-1 overflow-y-auto p-2.5">
        {MECHANIC_NAV_ITEMS.map((item) => {
          const isActive = isNavItemActive(pathname, item.href);
          const badge = badges?.[item.href] ?? 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? `${item.label}${badge > 0 ? ` (${badge})` : ""}` : undefined}
              className={cn(
                "relative mb-px flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                collapsed && "justify-center px-0",
                isActive
                  ? "bg-brand-blue font-semibold text-white"
                  : "font-medium text-text-secondary hover:bg-border-subtle hover:text-text-primary",
              )}
            >
              <Icon
                icon={item.icon}
                size={16}
                className={isActive ? "text-white" : "text-text-muted"}
              />
              {!collapsed && <span className="flex-1">{item.label}</span>}
              {badge > 0 &&
                (collapsed ? (
                  <span
                    aria-label={`${badge} needing attention`}
                    className="absolute right-3 top-2 size-2 rounded-full border-[1.5px] border-surface-card bg-danger"
                  />
                ) : (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none",
                      isActive ? "bg-white/20 text-white" : "bg-red-100 text-red-700",
                    )}
                  >
                    {badge}
                  </span>
                ))}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand" : "Collapse"}
        className={cn(
          "m-2.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-border-subtle hover:text-text-primary",
          collapsed && "justify-center px-0",
        )}
      >
        <Icon icon={collapsed ? ChevronRight : ChevronLeft} size={16} />
        {!collapsed && <span>Collapse</span>}
      </button>

      <form
        action={signOut}
        className={cn(
          "border-t border-border p-3",
          collapsed ? "flex flex-col items-center gap-2" : "flex items-center gap-2.5",
        )}
      >
        <input type="hidden" name="redirectTo" value="/mechanic/login" />
        <Avatar name={userName} size={32} tint={avatarTint} />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-text-primary">
              {userName}
            </div>
            <div className="text-[11px] capitalize text-text-muted">Mechanic</div>
          </div>
        )}
        <button
          type="submit"
          aria-label="Sign out"
          className="flex size-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-border-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
        >
          <Icon icon={LogOut} size={14} aria-label="Sign out" />
        </button>
      </form>
    </aside>
  );
}
