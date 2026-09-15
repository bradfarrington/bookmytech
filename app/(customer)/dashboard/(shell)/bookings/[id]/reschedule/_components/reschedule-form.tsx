"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Caption, Notice, Section } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";
import {
  TWO_HOUR_SLOTS,
  dayChipLabel,
  formatBookingDay,
  isSlotBookable,
  slotIso,
  twoHourSlotByWindow,
} from "@/lib/slots";
import { rescheduleAvailability, rescheduleBooking } from "@/app/actions/customer-bookings";

// The day chips, window tiles, reason and "Move to …" of the reschedule screen.
// The same pure helpers as the booking flow's Time step (lib/slots.ts), so a
// window closes here exactly when it closes there.

type Counts = Record<string, number>;

const FIELD =
  "block w-full resize-y rounded-lg border border-border bg-surface-card px-3 py-2.5 text-base leading-5 text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 sm:text-sm";

export function RescheduleForm({
  bookingId,
  nowIso,
  days,
  initialDay,
  initialCounts,
  currentIso,
  currentWindow,
  mechanicName,
}: {
  bookingId: string;
  nowIso: string;
  days: string[];
  initialDay: string;
  initialCounts: Counts | null;
  currentIso: string | null;
  currentWindow: string | null;
  mechanicName: string | null;
}) {
  const router = useRouter();
  const now = new Date(nowIso);
  const [day, setDay] = useState(initialDay);
  const [picked, setPicked] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  // undefined: still loading; null: couldn't count, so no captions.
  const [counts, setCounts] = useState<Record<string, Counts | null | undefined>>({ [initialDay]: initialCounts });
  const [pending, startTransition] = useTransition();

  const slot = twoHourSlotByWindow(picked);
  const iso = slot ? slotIso(day, slot.startHour) : null;
  const isCurrent = !!iso && !!currentIso && new Date(currentIso).toISOString() === iso && currentWindow === slot?.window;
  const dayCounts = counts[day];

  function pickDay(next: string) {
    setDay(next);
    setPicked(null);
    setError(null);
    if (next in counts) return;
    setCounts((prev) => ({ ...prev, [next]: undefined }));
    rescheduleAvailability(bookingId, next)
      .then((res) => setCounts((prev) => ({ ...prev, [next]: res.ok ? res.counts : null })))
      .catch(() => setCounts((prev) => ({ ...prev, [next]: null })));
  }

  function submit() {
    if (!slot || !iso) return;
    setError(null);
    if (!isSlotBookable(day, slot, new Date())) {
      setError("That window has just closed. Please pick another.");
      return;
    }
    startTransition(async () => {
      const res = await rescheduleBooking(bookingId, iso, reason, slot.window);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/dashboard/bookings/${bookingId}`);
    });
  }

  return (
    <>
      <div
        role="group"
        aria-label="Day"
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1.5 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
      >
        {days.map((key) => {
          const label = dayChipLabel(key, now);
          const open = TWO_HOUR_SLOTS.some((s) => isSlotBookable(key, s, now));
          const on = key === day;
          return (
            <button
              key={key}
              type="button"
              disabled={!open}
              aria-pressed={on}
              aria-label={formatBookingDay(slotIso(key, 12))}
              onClick={() => pickDay(key)}
              className={cn(
                "flex min-w-[52px] shrink-0 flex-col items-center gap-0.5 rounded-[11px] border px-1 py-[7px] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2",
                on
                  ? "border-brand-blue bg-brand-blue text-white"
                  : "border-border bg-surface-card text-text-primary hover:border-brand-blue/50",
                "disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] opacity-75">{label.weekday}</span>
              <span className="font-display text-[15px] font-extrabold leading-5">{label.dayOfMonth}</span>
            </button>
          );
        })}
      </div>

      <Section title="Arrival window">
        <div className="grid grid-cols-2 gap-2">
          {TWO_HOUR_SLOTS.map((option) => {
            const open = isSlotBookable(day, option, now);
            const on = open && picked === option.window;
            const count = dayCounts?.[option.window] ?? 0;
            return (
              <button
                key={option.window}
                type="button"
                disabled={!open}
                aria-pressed={on}
                onClick={() => {
                  setPicked(option.window);
                  setError(null);
                }}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-[10px] border bg-surface-card px-3 py-2.5 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2",
                  on ? "border-brand-blue bg-blue-50 ring-1 ring-inset ring-brand-blue" : "border-border hover:border-brand-blue/50",
                  "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border",
                )}
              >
                <span
                  className={cn(
                    "font-display text-sm font-bold leading-5",
                    on ? "text-brand-blue-dark" : open ? "text-text-primary" : "text-text-muted line-through",
                  )}
                >
                  {option.window}
                </span>
                <span className={cn("text-[11.5px] leading-4", on ? "text-brand-blue-dark" : "text-text-muted")}>
                  {!open ? "Closed" : count > 0 ? `${count} mechanic${count === 1 ? "" : "s"}` : " "}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <div>
        <label htmlFor="reschedule-reason" className="mb-1.5 block text-xs font-semibold text-text-secondary">
          Why are you moving it? <span className="font-normal text-text-muted">(optional)</span>
        </label>
        <textarea
          id="reschedule-reason"
          rows={3}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="For example, something's come up at work"
          className={FIELD}
        />
      </div>

      {error && (
        <div role="alert">
          <Notice tone="danger" title={error} />
        </div>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 mt-1 flex flex-col gap-2 border-t border-border-subtle bg-surface px-4 pb-5 pt-3 sm:-mx-6 sm:px-6">
        <Button variant="primary" size="lg" full disabled={!slot || isCurrent || pending} onClick={submit}>
          {pending ? "Moving your booking…" : slot && iso ? `Move to ${formatBookingDay(iso)} · ${slot.window}` : "Pick a window"}
        </Button>
        <Caption className="text-center">
          {isCurrent
            ? "That's the time you already have."
            : mechanicName
              ? `${mechanicName} keeps the job. Moving is free.`
              : "Moving is free."}
        </Caption>
      </div>
    </>
  );
}
