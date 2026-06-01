"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  FileText,
  Inbox,
  LogOut,
  type LucideIcon,
  PoundSterling,
  SlidersHorizontal,
  Star,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/avatar";
import { signOut } from "@/app/actions/sign-out";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: "Jobs", href: "/mechanic/jobs", icon: Inbox },
  { label: "Schedule", href: "/mechanic/schedule", icon: Calendar },
  { label: "Earnings", href: "/mechanic/earnings", icon: PoundSterling },
  { label: "Reviews", href: "/mechanic/reviews", icon: Star },
  { label: "Availability", href: "/mechanic/availability", icon: SlidersHorizontal },
  { label: "Profile", href: "/mechanic/profile", icon: User },
  { label: "Documents", href: "/mechanic/documents", icon: FileText },
];

export interface MechanicSidebarProps {
  userName: string;
  /** Avatar tint index, so different mechanics aren't all the same colour. */
  avatarTint?: number;
}

export function MechanicSidebar({ userName, avatarTint = 0 }: MechanicSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface-card">
      <div className="flex h-[88px] items-center justify-center border-b border-border px-5">
        <Image
          src="/logo.png"
          alt="Book My Tech"
          width={520}
          height={156}
          priority
          className="h-16 w-auto"
        />
      </div>

      <nav className="flex-1 overflow-y-auto p-2.5">
        {NAV_ITEMS.map((item) => {
          // Treat sub-routes (/mechanic/jobs/[id]) as keeping the parent active.
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "mb-px flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
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
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <form
        action={signOut}
        className="flex items-center gap-2.5 border-t border-border p-3"
      >
        <input type="hidden" name="redirectTo" value="/mechanic/login" />
        <Avatar name={userName} size={32} tint={avatarTint} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-text-primary">
            {userName}
          </div>
          <div className="text-[11px] capitalize text-text-muted">Mechanic</div>
        </div>
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
