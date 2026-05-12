import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Navigation labels shown across customer surfaces. Paths point at routes
// planned by the brief — most don't exist yet, but the labels and ordering
// match the proposal so links can be wired in as routes land.
const NAV_ITEMS = [
  { label: "Book", href: "/" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Services", href: "/#services" },
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
  return (
    <header
      className={cn(
        "flex h-24 items-center gap-8 px-8",
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
          className={cn("h-[76px] w-auto", dark && "brightness-0 invert")}
        />
      </Link>

      <nav className="ml-6 flex gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.label === active;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "rounded-lg px-3.5 py-2 text-sm transition-colors",
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

      <div className="flex items-center gap-2.5">
        <Link
          href="/login"
          className={cn(
            "text-[13px] font-medium",
            dark ? "text-white/70 hover:text-white" : "text-slate-700 hover:text-text-primary",
          )}
        >
          Sign in
        </Link>
        <Button
          variant={dark ? "secondary" : "primary"}
          size="sm"
          className={
            dark ? "border-transparent bg-white text-brand-blue hover:bg-white/90" : undefined
          }
        >
          Book a mechanic
        </Button>
      </div>
    </header>
  );
}
