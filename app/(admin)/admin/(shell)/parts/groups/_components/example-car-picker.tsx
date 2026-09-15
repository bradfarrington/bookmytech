"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Car } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

// The car that example parts are shown on, on /admin/parts/groups (Task 45).
// Suppliers only list parts for a real registration. The choice lives in the
// URL (?reg=) so it survives the refresh after every match.

export interface RecentVehicle {
  reg: string;
  description: string | null;
}

export function ExampleCarPicker({
  reg,
  recent,
  tab,
  q,
}: {
  reg: string | null;
  recent: RecentVehicle[];
  tab: string;
  q: string;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState("");

  const go = (next: string) => {
    const params = new URLSearchParams({ tab });
    if (q) params.set("q", q);
    if (next.trim()) params.set("reg", next.trim());
    router.push(`/admin/parts/groups?${params.toString()}`);
  };

  const options = recent.map((v) => ({ value: v.reg, label: v.description ? `${v.reg} · ${v.description}` : v.reg }));
  const known = recent.find((v) => v.reg === reg);

  return (
    <div className="rounded-2xl border border-border bg-surface-card px-4 py-3 shadow-card">
      <div className="flex items-start gap-3">
        <Car size={18} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary">
            {reg ? (
              <>
                Matching on <span className="font-mono">{reg}</span>
                {known?.description ? ` · ${known.description}` : ""}
              </>
            ) : (
              "Pick a car to match part groups on"
            )}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            &ldquo;Find the LKQ part&rdquo; on a group then lists only the LKQ parts that fit this car and shows
            LKQ&apos;s actual parts, with pictures, before you match. Pick a car that has the repair, or LKQ may
            list nothing for it.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {options.length > 0 && (
              <Select
                className="w-full sm:w-96"
                value={reg ?? ""}
                onChange={go}
                options={options}
                placeholder="Recently looked-up cars"
                aria-label="Recently looked-up cars"
              />
            )}
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (typed.trim()) go(typed);
              }}
            >
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value.toUpperCase())}
                placeholder="Or type a registration"
                aria-label="Registration"
                className="h-10 w-48 rounded-button border border-border bg-surface-card px-3 font-mono text-sm uppercase text-text-primary placeholder:font-sans placeholder:normal-case placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
              <Button type="submit" size="md" variant="secondary" disabled={!typed.trim()}>
                Use
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
