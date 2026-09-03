"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Clock, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { setArrivalWindow } from "@/app/actions/mechanic-jobs";
import type { ArrivalWindowOptions } from "@/lib/mechanics/arrival-windows";

// The six 2-hour windows a mechanic can narrow an ALL-DAY job to (Task 21).
// Rendered at the top of the job detail while the job is confirmed and still
// all-day; it disappears on its own once a window is set, because the server
// action changes `slot_window` and the page stops passing `options`.
//
// Mirrors the customer's slot picker so the two sides see the same grid. A
// clash with another job is greyed out (the server refuses it too); a window
// outside the mechanic's saved hours is marked but still selectable.

interface ArrivalWindowPickerProps {
  bookingId: string;
  options: ArrivalWindowOptions;
}

export function ArrivalWindowPicker({ bookingId, options }: ArrivalWindowPickerProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (!selected) return;
    startTransition(async () => {
      const res = await setArrivalWindow(bookingId, selected);
      if (res.ok) {
        toast.success("Arrival window confirmed — the customer's been told.");
      } else {
        toast.error(res.error);
      }
      // Either way the page re-reads the booking: on success the picker goes,
      // on a clash/race the grid reflects what the server now knows.
      router.refresh();
    });
  }

  const hoursLine = options.dayOff
    ? "This day is switched off in your availability."
    : options.hours
      ? `Your hours for this day are ${options.hours.start}–${options.hours.end}.`
      : null;

  return (
    <Card className="space-y-4 border-brand-blue/30 bg-blue-50/40 p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue">
          <CalendarClock size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-text-primary">Pick an arrival window</h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            The customer booked all day. Choose the 2-hour window you&apos;ll arrive in — they&apos;ll
            be told straight away. You can also leave it as all day.
          </p>
        </div>
      </div>

      {(hoursLine || options.allDayJobs.length > 0) && (
        <div className="space-y-1 rounded-lg bg-surface-card px-3.5 py-2.5 text-xs text-text-secondary">
          {hoursLine && (
            <p className="flex items-center gap-1.5">
              <Clock size={12} className="shrink-0 text-text-muted" />
              {hoursLine}
            </p>
          )}
          {options.allDayJobs.length > 0 && (
            <p className="flex items-center gap-1.5">
              <TriangleAlert size={12} className="shrink-0 text-amber-600" />
              You also have {options.allDayJobs.map((j) => `#${j.jobNumber}`).join(", ")} booked as all
              day — plan around {options.allDayJobs.length === 1 ? "it" : "them"}.
            </p>
          )}
        </div>
      )}

      {options.anySelectable ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            {options.options.map((o) => {
              const active = selected === o.window;
              const subLabel = !o.bookable
                ? "Passed"
                : o.clash
                  ? `Clashes with #${o.clash.jobNumber}`
                  : o.outsideHours
                    ? "Outside your hours"
                    : null;
              return (
                <button
                  key={o.window}
                  type="button"
                  disabled={!o.selectable || pending}
                  title={
                    o.clash
                      ? `You have job #${o.clash.jobNumber} (${o.clash.window}) then`
                      : !o.bookable
                        ? "This window has passed or starts too soon"
                        : undefined
                  }
                  onClick={() => setSelected(o.window)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-3.5 text-center transition-colors",
                    active
                      ? "border-brand-blue bg-brand-blue text-white"
                      : "border-border bg-surface-card text-text-primary hover:border-brand-blue/50",
                    "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border",
                  )}
                >
                  <span className="text-sm font-bold">{o.window}</span>
                  {subLabel && (
                    <span
                      className={cn(
                        "text-[11px] leading-tight",
                        active
                          ? "text-blue-100"
                          : o.outsideHours && o.selectable
                            ? "text-amber-600"
                            : "text-text-muted",
                      )}
                    >
                      {subLabel}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-text-muted">
              {selected
                ? `The customer will be told you'll arrive ${selected}.`
                : "Greyed-out windows clash with another job or have passed."}
            </p>
            <Button variant="primary" onClick={confirm} disabled={!selected || pending}>
              {pending ? "Confirming…" : "Confirm window"}
            </Button>
          </div>
        </>
      ) : (
        <p className="rounded-lg bg-surface-card px-4 py-3 text-sm text-text-secondary">
          No windows left today — the job stays all day.
        </p>
      )}
    </Card>
  );
}
