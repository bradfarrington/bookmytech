"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  FileText,
  Folder,
  Home,
  LogOut,
  type LucideIcon,
  Map,
  MessageSquare,
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
import { useSidebarCollapsed } from "@/lib/use-sidebar-collapsed";

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
      { label: "SMS", href: "/admin/sms", icon: MessageSquare },
    ],
  },
];

export interface AdminSidebarProps {
  userName: string;
  userRole: string;
}

export function AdminSidebar({ userName, userRole }: AdminSidebarProps) {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebarCollapsed();

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col bg-text-primary text-white transition-[width] duration-200",
        collapsed ? "w-[72px]" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center border-b border-white/10",
          collapsed ? "px-2 py-5" : "px-5 py-6",
        )}
      >
        {collapsed ? (
          <Image
            src="/favicon.png"
            alt="Book My Tech"
            width={64}
            height={64}
            priority
            className="size-9 object-contain"
          />
        ) : (
          <Image
            src="/logo-no-bg.png"
            alt="Book My Tech"
            width={520}
            height={156}
            priority
            className="h-24 w-auto brightness-0 invert"
          />
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-2.5">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-3.5">
            {collapsed ? (
              <div className="mx-3 my-1.5 border-t border-white/10" />
            ) : (
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                {group.title}
              </div>
            )}
            {group.items.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "mb-px flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors",
                    collapsed && "justify-center px-0",
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
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand" : "Collapse"}
        className={cn(
          "m-2.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white",
          collapsed && "justify-center px-0",
        )}
      >
        <Icon icon={collapsed ? ChevronRight : ChevronLeft} size={15} className="text-slate-400" />
        {!collapsed && <span>Collapse</span>}
      </button>

      <form
        action={signOut}
        className={cn(
          "border-t border-white/10 p-3",
          collapsed ? "flex flex-col items-center gap-2" : "flex items-center gap-2.5",
        )}
      >
        <Avatar name={userName} size={32} tint={4} />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-white">
              {userName}
            </div>
            <div className="text-[11px] capitalize text-slate-400">
              {userRole}
            </div>
          </div>
        )}
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
