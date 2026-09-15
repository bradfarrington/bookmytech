"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Car, Home, Plus, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// The customer dashboard's top header (Task 48). The app has a bottom tab bar
// (Home, Garage, Inbox, Account) with a raised Book button; the website puts
// the same four destinations and the Book button in a header instead. On a
// phone-width screen the tabs sit in a second row under the logo, still at
// the top.

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Path prefixes that belong to this tab. */
  matches: string[];
}

const TABS: Tab[] = [
  {
    href: "/dashboard",
    label: "Home",
    icon: Home,
    matches: ["/dashboard/bookings", "/dashboard/quotes", "/dashboard/revisions", "/dashboard/disputes", "/dashboard/mechanics"],
  },
  { href: "/dashboard/garage", label: "Garage", icon: Car, matches: ["/dashboard/garage"] },
  { href: "/dashboard/inbox", label: "Inbox", icon: Bell, matches: ["/dashboard/inbox"] },
  { href: "/dashboard/settings", label: "Account", icon: User, matches: ["/dashboard/settings", "/dashboard/help"] },
];

function isActive(tab: Tab, pathname: string): boolean {
  if (pathname === tab.href) return true;
  return tab.matches.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function initials(name: string): string {
  return (
    name
      .split(/[\s@]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?"
  );
}

export function AppHeader({
  name,
  avatarUrl,
  unreadCount,
}: {
  name: string;
  avatarUrl: string | null;
  unreadCount: number;
}) {
  const pathname = usePathname() ?? "/dashboard";

  const tabLink = (tab: Tab, compact: boolean) => {
    const active = isActive(tab, pathname);
    const Icon = tab.icon;
    const showDot = tab.href === "/dashboard/inbox" && unreadCount > 0;
    return (
      <Link
        key={tab.href}
        href={tab.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative inline-flex items-center justify-center font-semibold transition-colors",
          compact
            ? cn(
                "flex-1 flex-col gap-0.5 py-2 text-[11px]",
                active ? "text-brand-blue" : "text-text-muted hover:text-text-primary",
              )
            : cn(
                "h-9 gap-1.5 rounded-full px-3.5 text-[13px]",
                active ? "bg-surface-dark text-white" : "text-text-secondary hover:bg-border-subtle hover:text-text-primary",
              ),
        )}
      >
        <span className="relative">
          <Icon size={compact ? 20 : 16} strokeWidth={active ? 2.4 : 2} aria-hidden />
          {showDot && (
            <span
              className={cn(
                "absolute -right-1 -top-0.5 size-2 rounded-full bg-brand-blue ring-2",
                compact ? "ring-surface-card" : active ? "ring-surface-dark" : "ring-surface-card",
              )}
            />
          )}
        </span>
        {tab.label}
        {showDot && <span className="sr-only">, {unreadCount} unread</span>}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface-card/95 backdrop-blur supports-[backdrop-filter]:bg-surface-card/85">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Book My Tech home" className="shrink-0">
          <Image src="/logo-no-bg.png" alt="Book My Tech" width={120} height={32} className="h-8 w-auto" priority />
        </Link>

        <nav aria-label="Your account" className="hidden flex-1 items-center gap-1 md:flex">
          {TABS.map((tab) => tabLink(tab, false))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <Link
            href="/book"
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-brand-gradient px-3.5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(37,99,235,0.3)] transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
          >
            <Plus size={16} strokeWidth={2.6} aria-hidden />
            <span className="hidden sm:inline">Book a mechanic</span>
            <span className="sm:hidden">Book</span>
          </Link>
          <Link
            href="/dashboard/settings"
            aria-label="Account settings"
            className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-green-100 font-display text-[13px] font-bold text-green-700"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              initials(name)
            )}
          </Link>
        </div>
      </div>

      <nav aria-label="Your account" className="flex border-t border-border-subtle md:hidden">
        {TABS.map((tab) => tabLink(tab, true))}
      </nav>
    </header>
  );
}
