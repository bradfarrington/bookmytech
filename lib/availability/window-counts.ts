import {
  buildArrivalWindowOptions,
  type AvailabilityRow,
  type SiblingBooking,
} from "@/lib/mechanics/arrival-windows";
import { ALL_DAY_SLOT, TWO_HOUR_SLOTS, isSlotBookable } from "@/lib/slots";

// How many mechanics are free in each arrival window of a day (Task 54): the
// "4 mechanics" under a window on the booking flow's Time step.
//
// Pure, over rows the loader already fetched. It reuses the mechanic-side
// calendar (lib/mechanics/arrival-windows.ts) so "free" means exactly what the
// mechanic's own window picker means:
//   • inside their saved hours for that weekday (no saved hours counts as
//     free, as it does on their picker: unknown is not "off"), and
//   • no clash with another timed job of theirs.
// An un-narrowed all-day job doesn't block a window there, so it doesn't here.
//
// A count, not a promise. Dispatch still broadcasts to every mechanic in range
// who is online when the booking is made.

export interface MechanicDay {
  mechanicId: string;
  availability: AvailabilityRow | null;
  siblings: SiblingBooking[];
}

export interface WindowCount {
  /** "10am–12pm", or "All day (8am–8pm)". The same labels as BookingSlotOption.window. */
  window: string;
  /** Null for all day. */
  startHour: number | null;
  mechanics: number;
  /** The window can still be booked (lead time), whatever the count. */
  bookable: boolean;
}

export function countMechanicsPerWindow(
  dayKey: string,
  mechanics: MechanicDay[],
  now: Date = new Date(),
): WindowCount[] {
  const perWindow = TWO_HOUR_SLOTS.map(() => 0);
  let allDay = 0;

  for (const mechanic of mechanics) {
    const { options } = buildArrivalWindowOptions({
      dayKey,
      availability: mechanic.availability,
      siblings: mechanic.siblings,
      now,
    });
    let anyFree = false;
    options.forEach((option, index) => {
      if (!option.outsideHours && !option.clash) {
        perWindow[index] += 1;
        anyFree = true;
      }
    });
    if (anyFree) allDay += 1;
  }

  return [
    ...TWO_HOUR_SLOTS.map((slot, index) => ({
      window: slot.window,
      startHour: slot.startHour,
      mechanics: perWindow[index],
      bookable: isSlotBookable(dayKey, slot, now),
    })),
    {
      window: ALL_DAY_SLOT.window,
      startHour: null,
      mechanics: allDay,
      bookable: isSlotBookable(dayKey, ALL_DAY_SLOT, now),
    },
  ];
}
