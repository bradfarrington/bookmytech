import { londonDateKey, slotIso, twoHourSlotByWindow } from "@/lib/slots";

// Whether a reschedule keeps an arrival window (Task 48).
//
// Moving a booking used to always clear `slot_window`, so a customer who picked
// "2pm–4pm" on the reschedule screen ended up booked for exactly 14:00. Now the
// client can say which window it picked, and the booking keeps it, but only
// when the claim is consistent: the label is one of the six 2-hour windows AND
// the new instant is that window's start on the UK day it falls on. Anything
// else (no label, the all-day label, a typo, a start that doesn't match) is an
// exact time, which is what every reschedule was before.
//
// Plain module, no I/O, so it can be unit-tested (reschedule-window.test.ts).

/** The window to store on the rescheduled booking, or null for an exact time. */
export function rescheduleSlotWindow(newIso: string, slotWindow: unknown): string | null {
  if (typeof slotWindow !== "string") return null;
  const slot = twoHourSlotByWindow(slotWindow);
  if (!slot) return null;
  const when = new Date(newIso);
  if (Number.isNaN(when.getTime())) return null;
  return slotIso(londonDateKey(when), slot.startHour) === when.toISOString() ? slot.window : null;
}
