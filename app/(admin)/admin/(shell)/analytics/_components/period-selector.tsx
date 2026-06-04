"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

// Segmented period toggle. Writes the choice to ?period= so the server
// component re-fetches its aggregations for the new window. URL state (not React
// state) keeps the selection shareable and survives a refresh.

export const PERIODS = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "year", label: "Year" },
] as const;

export type PeriodValue = (typeof PERIODS)[number]["value"];

export function PeriodSelector({ current }: { current: PeriodValue }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function select(value: PeriodValue) {
    if (value === current) return;
    const next = new URLSearchParams(params);
    next.set("period", value);
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-border bg-surface-card p-1",
        pending && "opacity-60",
      )}
      role="group"
      aria-label="Reporting period"
    >
      {PERIODS.map((p) => {
        const active = p.value === current;
        return (
          <button
            key={p.value}
            type="button"
            aria-pressed={active}
            onClick={() => select(p.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
              active
                ? "bg-brand-blue text-white"
                : "text-text-secondary hover:bg-surface hover:text-text-primary",
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
