"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

// Navigation labels shown across customer surfaces.
const NAV_ITEMS = [
  { label: "Book", href: "/book" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Repairs", href: "/#repairs" },
  { label: "For mechanics", href: "/mechanics" },
  { label: "Help", href: "/help" },
] as const;

export type CustomerNavActive = (typeof NAV_ITEMS)[number]["label"];

export interface CustomerNavProps {
  active?: CustomerNavActive;
  /** Renders with transparent background + light text for use over the hero gradient. */
  dark?: boolean;
}

export function CustomerNav({ active = "Book", dark = false }: CustomerNavProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <header
      className={cn(
        "flex h-20 items-center gap-4 px-4 sm:px-8 lg:h-24 lg:gap-8",
        dark
          ? "border-b border-white/10 bg-transparent text-white"
          : "border-b border-border bg-surface-card text-text-primary",
      )}
    >
      <Link href="/" className="flex items-center" aria-label="Book My Tech home">
        <Image
          src="/logo.png"
          alt="Book My Tech"
          width={228}
          height={76}
          priority
          className={cn("h-16 w-auto lg:h-[76px]", dark && "brightness-0 invert")}
        />
      </Link>

      <nav className="ml-6 hidden gap-1 lg:flex">
        {NAV_ITEMS.map((item) => {
          const isActive = item.label === active;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-lg px-3.5 py-2 text-sm transition-colors",
                isActive
                  ? dark
                    ? "bg-white/10 font-semibold text-white"
                    : "bg-blue-50 font-semibold text-brand-blue"
                  : dark
                    ? "font-medium text-white/70 hover:text-white"
                    : "font-medium text-slate-700 hover:text-text-primary",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="hidden items-center gap-2.5 lg:flex">
        <Link
          href="/login"
          className={cn(
            "text-[13px] font-medium",
            dark ? "text-white/70 hover:text-white" : "text-slate-700 hover:text-text-primary",
          )}
        >
          Sign in
        </Link>
        <Link href="/book">
          <Button
            variant={dark ? "secondary" : "primary"}
            size="sm"
            className={cn(
              "whitespace-nowrap",
              dark && "border-transparent bg-white text-brand-blue hover:bg-white/90",
            )}
          >
            Book a mechanic
          </Button>
        </Link>
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="customer-nav-drawer"
        className={cn(
          "flex size-10 items-center justify-center rounded-lg transition-colors lg:hidden",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          dark
            ? "text-white hover:bg-white/10 focus-visible:ring-white"
            : "text-text-primary hover:bg-border-subtle focus-visible:ring-brand-blue",
        )}
      >
        <Icon icon={Menu} size={24} />
      </button>

      <NavDrawer
        open={open}
        onClose={() => setOpen(false)}
        active={active}
      />
    </header>
  );
}

interface NavDrawerProps {
  open: boolean;
  onClose: () => void;
  active: CustomerNavActive;
}

function NavDrawer({ open, onClose, active }: NavDrawerProps) {
  return (
    <div
      id="customer-nav-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
      aria-hidden={!open}
      className={cn(
        "fixed inset-0 z-50 lg:hidden",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
    >
      <div
        onClick={onClose}
        aria-hidden
        className={cn(
          "absolute inset-0 bg-black/50 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
      />

      <aside
        className={cn(
          "absolute right-0 top-0 flex h-full w-[300px] max-w-[85vw] flex-col bg-surface-card shadow-hero",
          "transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex h-20 items-center justify-between border-b border-border px-5">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-muted">
            Menu
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex size-10 items-center justify-center rounded-lg text-text-primary transition-colors hover:bg-border-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
          >
            <Icon icon={X} size={22} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
          {NAV_ITEMS.map((item) => {
            const isActive = item.label === active;
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "rounded-lg px-3.5 py-3 text-[15px] transition-colors",
                  isActive
                    ? "bg-blue-50 font-semibold text-brand-blue"
                    : "font-medium text-text-primary hover:bg-border-subtle",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-3 border-t border-border p-4">
          <Link
            href="/login"
            onClick={onClose}
            className="text-center text-sm font-medium text-text-secondary hover:text-text-primary"
          >
            Sign in
          </Link>
          <Link href="/book" onClick={onClose} className="block">
            <Button variant="primary" size="md" fullWidth>
              Book a mechanic
            </Button>
          </Link>
        </div>
      </aside>
    </div>
  );
}
