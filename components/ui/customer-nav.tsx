"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LayoutDashboard, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useCustomerSession } from "@/components/ui/use-customer-session";

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
  /** The current section. Omit on pages that aren't a nav item (the homepage, legal pages). */
  active?: CustomerNavActive;
}

// Sticky, frosted top bar shared by the homepage, /help, /mechanics and the
// legal pages (Task 46 redesign). Render it as a sibling ABOVE the page's hero,
// never inside a <section>: a sticky element only sticks within its parent.
export function CustomerNav({ active }: CustomerNavProps) {
  const [open, setOpen] = useState(false);
  const signedIn = useCustomerSession();

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
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-white/85 backdrop-blur-[14px] backdrop-saturate-[1.4]">
        <div className="mx-auto flex h-[68px] max-w-content items-center gap-4 px-4 sm:px-6 lg:gap-8">
          <Link href="/" className="flex shrink-0 items-center" aria-label="Book My Tech home">
            {/* The cropped logo: logo.png carries vertical padding that shrinks
                the mark to nothing in a 68px bar. width/height are the display
                size (1463×368 scaled to 40px tall) — the intrinsic size makes
                next/image request a 1920px variant it never needs. */}
            <Image
              src="/logo-cropped.png"
              alt="Book My Tech"
              width={159}
              height={40}
              priority
              className="h-9 w-auto sm:h-10"
            />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {NAV_ITEMS.map((item) => {
              const isActive = item.label === active;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                    isActive
                      ? "text-brand-blue"
                      : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex-1" />

          <div className="hidden items-center gap-3 lg:flex">
            {/* Fixed min-width so resolving the session doesn't shift the nav.
                While `signedIn` is undefined this renders nothing but keeps its
                space — better than flashing "Sign in" at a signed-in customer. */}
            <span className="flex min-w-[104px] justify-end">
              {signedIn !== undefined && (
                <Link href={signedIn ? "/dashboard" : "/login"}>
                  <Button
                    variant="ghost"
                    className="whitespace-nowrap font-bold text-text-primary hover:border-text-primary hover:bg-transparent"
                  >
                    {signedIn ? "My account" : "Sign in"}
                  </Button>
                </Link>
              )}
            </span>
            <Link href="/book">
              <Button variant="dark" className="whitespace-nowrap font-bold">
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
            className="flex size-10 items-center justify-center rounded-lg text-text-primary transition-colors hover:bg-border-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 lg:hidden"
          >
            <Icon icon={Menu} size={24} />
          </button>
        </div>
      </header>

      {/* Outside <header> on purpose: backdrop-filter makes the header the
          containing block for fixed descendants, which would clip the drawer
          to the 68px bar. */}
      <NavDrawer
        open={open}
        onClose={() => setOpen(false)}
        active={active}
        signedIn={signedIn}
      />
    </>
  );
}

interface NavDrawerProps {
  open: boolean;
  onClose: () => void;
  active: CustomerNavActive | undefined;
  /** undefined while the session is still resolving — see useCustomerSession. */
  signedIn: boolean | undefined;
}

function NavDrawer({ open, onClose, active, signedIn }: NavDrawerProps) {
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
        <div className="flex h-[68px] items-center justify-between border-b border-border px-5">
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
                aria-current={isActive ? "page" : undefined}
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
          {signedIn === undefined ? (
            <span className="h-5" aria-hidden />
          ) : signedIn ? (
            <Link
              href="/dashboard"
              onClick={onClose}
              className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-brand-blue hover:underline"
            >
              <Icon icon={LayoutDashboard} size={16} />
              My account
            </Link>
          ) : (
            <Link
              href="/login"
              onClick={onClose}
              className="text-center text-sm font-medium text-text-secondary hover:text-text-primary"
            >
              Sign in
            </Link>
          )}
          <Link href="/book" onClick={onClose} className="block">
            <Button variant="dark" size="md" fullWidth className="font-bold">
              Book a mechanic
            </Button>
          </Link>
        </div>
      </aside>
    </div>
  );
}
