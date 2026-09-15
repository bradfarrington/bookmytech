"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  ALL_DAY_SLOT,
  MAX_CANDIDATE_DAYS,
  MIN_LEAD_MINUTES,
  TWO_HOUR_SLOTS,
  dayChipLabel,
  dayHasBookableSlot,
  isSlotBookable,
  londonDateKey,
  slotIso,
  upcomingDayKeys,
} from "@/lib/slots";
import type { BookingTimeParams } from "@/lib/bookings/step-params";

// The day and arrival-window picker (Task 47), used by the Time step and by
// Confirm when a window closes mid-checkout. Controlled: the parent owns the
// value and the clock, so Confirm can re-pick a time without losing a card hold
// it already has.
//
// Window buttons are named by their label first ("8am–10am"), and closed ones
// use the native `disabled` attribute: the booking e2e specs rely on both.

export interface TimeValue {
  slot: string | null;
  window: string | null;
  /** Candidate days when offering several (Task 28). */
  days: string[];
  flexible: boolean;
}

export const EMPTY_TIME: TimeValue = { slot: null, window: null, days: [], flexible: false };

export function timeValueFrom(time: BookingTimeParams | null): TimeValue {
  if (!time) return EMPTY_TIME;
  return { slot: time.slot, window: time.window, days: time.days, flexible: time.days.length >= 2 };
}

/** The chosen time as step params, or null when nothing is chosen. */
export function timeParamsFrom(value: TimeValue): BookingTimeParams | null {
  if (!value.slot || !value.window) return null;
  return { slot: value.slot, window: value.window, days: value.flexible ? value.days : [] };
}

/**
 * Whether the choice can still be booked: a single window must start at least
 * MIN_LEAD_MINUTES away; an offer of several days needs two still open.
 */
export function isTimeOpen(value: TimeValue, now: Date): boolean {
  if (value.flexible) {
    return value.days.filter((day) => isSlotBookable(day, ALL_DAY_SLOT, now)).length >= 2;
  }
  return !!value.slot && new Date(value.slot).getTime() - now.getTime() >= MIN_LEAD_MINUTES * 60_000;
}

interface TimePickerProps {
  value: TimeValue;
  onChange: (next: TimeValue) => void;
  now: Date;
}

export function TimePicker({ value, onChange, now }: TimePickerProps) {
  const days = upcomingDayKeys(now);
  const [selectedDay, setSelectedDay] = useState(() => {
    const chosen = value.slot ? londonDateKey(new Date(value.slot)) : null;
    if (chosen && days.includes(chosen)) return chosen;
    return days.find((day) => dayHasBookableSlot(day, now)) ?? days[0];
  });

  const openFlexDays = value.days.filter((day) => isSlotBookable(day, ALL_DAY_SLOT, now));

  function applyFlexDays(next: string[]) {
    const sorted = [...new Set(next)].sort();
    onChange({
      flexible: true,
      days: sorted,
      slot: sorted.length ? slotIso(sorted[0], ALL_DAY_SLOT.startHour) : null,
      window: sorted.length ? ALL_DAY_SLOT.window : null,
    });
  }

  function setFlexibleMode(on: boolean) {
    if (on) applyFlexDays(dayHasBookableSlot(selectedDay, now) ? [selectedDay] : []);
    else onChange(EMPTY_TIME);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
          {value.flexible ? "Tick the days you're happy with" : "Pick a day"}
        </p>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {days.map((day) => {
            const active = value.flexible ? value.days.includes(day) : day === selectedDay;
            const bookable = value.flexible
              ? isSlotBookable(day, ALL_DAY_SLOT, now)
              : dayHasBookableSlot(day, now);
            const label = dayChipLabel(day, now);
            return (
              <button
                key={day}
                type="button"
                disabled={!bookable}
                title={
                  bookable
                    ? undefined
                    : value.flexible
                      ? "The all-day window has already started today"
                      : "No more arrival windows today"
                }
                aria-pressed={active}
                onClick={() => {
                  if (value.flexible) {
                    applyFlexDays(active ? value.days.filter((d) => d !== day) : [...value.days, day]);
                    return;
                  }
                  setSelectedDay(day);
                  onChange(EMPTY_TIME);
                }}
                className={cn(
                  "flex w-[58px] shrink-0 flex-col items-center gap-1 rounded-xl border py-2.5 text-center transition-colors",
                  active
                    ? "border-brand-blue bg-brand-blue text-white shadow-[0_6px_16px_rgba(37,99,235,0.28)]"
                    : "border-border bg-white text-text-primary hover:border-brand-blue/50",
                  "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border",
                )}
              >
                <span
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-wide",
                    active ? "text-blue-100" : "text-text-muted",
                  )}
                >
                  {label.weekday}
                </span>
                <span className="font-display text-xl font-extrabold leading-none">{label.dayOfMonth}</span>
              </button>
            );
          })}
        </div>
      </div>

      {value.flexible ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-brand-blue/30 bg-blue-50/60 p-4">
          <div>
            <p className="text-sm font-semibold text-text-primary">
              {openFlexDays.length === 0
                ? "Tick at least two days above"
                : openFlexDays.length === 1
                  ? "Tick one more day above"
                  : `${openFlexDays.length} days offered · All day (8am–8pm)`}
            </p>
            <p className="mt-0.5 text-[13px] text-text-secondary">
              With several days offered, the whole day is open on each. Your mechanic picks the day
              and a 2-hour arrival window, and we&apos;ll tell you straight away.
              {value.days.length >= MAX_CANDIDATE_DAYS ? " That's the most you can offer." : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFlexibleMode(false)}
            className="self-start text-[13px] font-semibold text-brand-blue hover:underline"
          >
            Choose a single day and window instead
          </button>
        </div>
      ) : (
        <div>
          <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
            Arrival window
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {TWO_HOUR_SLOTS.map((slot) => {
              const iso = slotIso(selectedDay, slot.startHour);
              const bookable = isSlotBookable(selectedDay, slot, now);
              const active = bookable && value.slot === iso && value.window === slot.window;
              return (
                <button
                  key={slot.window}
                  type="button"
                  disabled={!bookable}
                  title={bookable ? undefined : "This window has passed"}
                  aria-pressed={active}
                  onClick={() => onChange({ flexible: false, days: [], slot: iso, window: slot.window })}
                  className={cn(
                    "rounded-xl border px-3 py-3.5 text-center font-display text-[15px] font-extrabold transition-colors",
                    active
                      ? "border-brand-blue bg-blue-50 text-brand-blue-dark ring-1 ring-inset ring-brand-blue"
                      : "border-border bg-white text-text-primary hover:border-brand-blue/50",
                    "disabled:cursor-not-allowed disabled:text-text-muted disabled:line-through disabled:opacity-50 disabled:hover:border-border",
                  )}
                >
                  {slot.window}
                </button>
              );
            })}
          </div>

          {(() => {
            const iso = slotIso(selectedDay, ALL_DAY_SLOT.startHour);
            const bookable = isSlotBookable(selectedDay, ALL_DAY_SLOT, now);
            const active = bookable && value.slot === iso && value.window === ALL_DAY_SLOT.window;
            return (
              <button
                type="button"
                disabled={!bookable}
                title={bookable ? undefined : "The all-day window has already started"}
                aria-pressed={active}
                onClick={() =>
                  onChange({ flexible: false, days: [], slot: iso, window: ALL_DAY_SLOT.window })
                }
                className={cn(
                  "mt-2.5 flex w-full flex-col items-center gap-0.5 rounded-xl border px-3 py-3 text-center transition-colors",
                  active
                    ? "border-brand-blue bg-blue-50 ring-1 ring-inset ring-brand-blue"
                    : "border-border bg-white hover:border-brand-blue/50",
                  "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border",
                )}
              >
                <span
                  className={cn(
                    "font-display text-[15px] font-extrabold",
                    active ? "text-brand-blue-dark" : bookable ? "text-text-primary" : "text-text-muted line-through",
                  )}
                >
                  All day
                </span>
                <span className="text-[12px] text-text-muted">8am to 8pm, if you&apos;re flexible</span>
              </button>
            );
          })()}

          {!dayHasBookableSlot(selectedDay, now) && (
            <p className="mt-3 rounded-xl bg-surface px-4 py-3 text-sm text-text-secondary">
              No more arrival windows today. Pick another day above.
            </p>
          )}

          <button
            type="button"
            onClick={() => setFlexibleMode(true)}
            className="mt-3 text-[13px] font-semibold text-brand-blue hover:underline"
          >
            Flexible? Offer more than one day
          </button>
        </div>
      )}
    </div>
  );
}
