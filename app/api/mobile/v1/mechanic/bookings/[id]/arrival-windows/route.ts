import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { loadArrivalWindowOptionsForDays } from "@/lib/mechanics/arrival-windows";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALL_DAY_SLOT, formatBookingDay, isFlexibleBooking, londonDateKey, slotIso } from "@/lib/slots";

// GET /api/mobile/v1/mechanic/bookings/[id]/arrival-windows — what the window
// picker draws. AUTHENTICATED, mechanics only, and only for a job they hold.
//
// 200:  { needsArrivalWindow, days: [{ dayKey, label, options, hours, dayOff,
//         allDayJobs, anySelectable }] }
//       One entry per day the mechanic may pick: the single day of an all-day
//       booking, or each day a flexible booking offers. `options` is always the
//       six 2-hour windows, each `{ window, startHour, iso, bookable,
//       outsideHours, clash, selectable }` — see ArrivalWindowOption in
//       lib/mechanics/arrival-windows.ts. Enable what is `selectable`; POST the
//       `window` label (and the `dayKey`) to …/arrival-window.
//       `needsArrivalWindow: false` with `days: []` means there is nothing to
//       pick — the job already has a window, or isn't confirmed.
//       Otherwise `{ error }`: 401, 403 (not a mechanic / not their job), 404, 429.
//
// Served per job rather than as a static list so the app duplicates neither
// the windows nor the rules: the website's job page builds its picker from the
// same function, and the POST re-checks with it, so the three can't disagree
// about a clash or a window that has already started.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await mobileMechanicCaller(request, "mechanicfeed");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, status, mechanic_id, scheduled_at, slot_window, candidate_days, reschedule_status")
    .eq("id", id)
    .maybeSingle();
  if (!booking) return apiError("That job no longer exists.", 404);
  if (booking.mechanic_id !== auth.caller.userId) return apiError("This isn't your job.", 403);

  const pickable =
    booking.status === "confirmed" &&
    booking.slot_window === ALL_DAY_SLOT.window &&
    booking.reschedule_status !== "proposed" &&
    !!booking.scheduled_at;
  if (!pickable) return apiOk({ needsArrivalWindow: false, days: [] });

  const dayKeys = isFlexibleBooking(booking)
    ? [...(booking.candidate_days as string[])]
    : [londonDateKey(new Date(booking.scheduled_at))];
  const days = await loadArrivalWindowOptionsForDays(admin, auth.caller.userId, { id: booking.id }, dayKeys);

  return apiOk({
    needsArrivalWindow: true,
    days: days.map((day) => ({ ...day, label: formatBookingDay(slotIso(day.dayKey, 12)) })),
  });
}
