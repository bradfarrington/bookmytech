"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  FileText,
  Folder,
  Home,
  LogOut,
  type LucideIcon,
  Map,
  Package,
  PoundSterling,
  Shield,
  Users,
  Wrench,
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

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: readonly NavGroup[] = [
  {
    title: "Operations",
    items: [
      { label: "Overview", href: "/admin", icon: Home },
      { label: "All jobs", href: "/admin/jobs", icon: Folder },
      { label: "Live monitor", href: "/admin/live", icon: Activity },
      { label: "Disputes", href: "/admin/disputes", icon: AlertTriangle },
    ],
  },
  {
    title: "Network",
    items: [
      { label: "Mechanics", href: "/admin/mechanics", icon: Users },
      { label: "Approvals", href: "/admin/approvals", icon: Shield },
      { label: "Documents", href: "/admin/documents", icon: FileText },
    ],
  },
  {
    title: "Commercial",
    items: [
      { label: "Pricing", href: "/admin/pricing", icon: PoundSterling },
      { label: "Areas & demand", href: "/admin/areas", icon: Map },
      { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
      { label: "Services", href: "/admin/services", icon: Wrench },
      { label: "Parts", href: "/admin/parts", icon: Package },
    ],
  },
];

export interface AdminSidebarProps {
  userName: string;
  userRole: string;
}

export function AdminSidebar({ userName, userRole }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-text-primary text-white">
      <div className="flex items-center justify-center border-b border-white/10 px-5 py-6">
        <Image
          src="/logo-no-bg.png"
          alt="Book My Tech"
          width={520}
          height={156}
          priority
          className="h-24 w-auto brightness-0 invert"
        />
      </div>

      <nav className="flex-1 overflow-y-auto p-2.5">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-3.5">
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
              {group.title}
            </div>
            {group.items.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "mb-px flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors",
                    isActive
                      ? "bg-brand-blue font-semibold text-white"
                      : "font-medium text-slate-300 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <Icon
                    icon={item.icon}
                    size={15}
                    className={isActive ? "text-white" : "text-slate-400"}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <form
        action={signOut}
        className="flex items-center gap-2.5 border-t border-white/10 p-3"
      >
        <Avatar name={userName} size={32} tint={4} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-white">
            {userName}
          </div>
          <div className="text-[11px] capitalize text-slate-400">
            {userRole}
          </div>
        </div>
        <button
          type="submit"
          aria-label="Sign out"
          className="flex size-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 focus-visible:ring-offset-text-primary"
        >
          <Icon icon={LogOut} size={14} aria-label="Sign out" />
        </button>
      </form>
    </aside>
  );
}
