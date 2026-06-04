"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/avatar";
import { signOut } from "@/app/actions/sign-out";
import { MECHANIC_NAV_ITEMS, isNavItemActive } from "@/components/mechanic/nav-items";

export interface MechanicMobileNavProps {
  userName: string;
  avatarTint?: number;
}

// Hamburger + slide-in drawer for narrow viewports (the desktop sidebar is
// hidden below md). This is responsive-web nav, not an app-style bottom bar.
export function MechanicMobileNav({ userName, avatarTint = 0 }: MechanicMobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Lock body scroll + wire Escape while the drawer is open. (Navigation closes
  // the drawer via each link's onClick, so there's no route-change effect.)
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="flex size-11 items-center justify-center rounded-button text-text-secondary transition-colors hover:bg-border-subtle md:hidden"
      >
        <Icon icon={Menu} size={22} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Scrim */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />

          {/* Drawer */}
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[82%] flex-col bg-surface-card pt-[env(safe-area-inset-top)] shadow-xl">
            <div className="flex h-[72px] items-center justify-between border-b border-border pl-5 pr-3">
              <Image src="/logo.png" alt="Book My Tech" width={420} height={126} className="h-12 w-auto" priority />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex size-11 items-center justify-center rounded-button text-text-muted transition-colors hover:bg-border-subtle"
              >
                <Icon icon={X} size={20} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-3">
              {MECHANIC_NAV_ITEMS.map((item) => {
                const isActive = isNavItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "mb-0.5 flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] transition-colors",
                      isActive
                        ? "bg-brand-blue font-semibold text-white"
                        : "font-medium text-text-secondary hover:bg-border-subtle hover:text-text-primary",
                    )}
                  >
                    <Icon icon={item.icon} size={18} className={isActive ? "text-white" : "text-text-muted"} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <form
              action={signOut}
              className="flex items-center gap-2.5 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            >
              <input type="hidden" name="redirectTo" value="/mechanic/login" />
              <Avatar name={userName} size={36} tint={avatarTint} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-text-primary">{userName}</div>
                <div className="text-xs capitalize text-text-muted">Mechanic</div>
              </div>
              <button
                type="submit"
                aria-label="Sign out"
                className="flex size-11 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-border-subtle hover:text-text-primary"
              >
                <Icon icon={LogOut} size={16} aria-label="Sign out" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
