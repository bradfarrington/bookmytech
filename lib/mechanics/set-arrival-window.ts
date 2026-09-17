import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { sendSms } from "@/lib/sms/send-sms";
import { renderSmsTemplate } from "@/lib/sms/render-template";
import { sendPushToCustomer } from "@/lib/push/send";
import { loadArrivalWindowOptionsForDays } from "@/lib/mechanics/arrival-windows";
import {
  ALL_DAY_SLOT,
  formatBookingDay,
  formatBookingSlot,
  isDayKey,
  isFlexibleBooking,
  isSlotBookable,
  londonDateKey,
  slotIso,
  twoHourSlotByWindow,
} from "@/lib/slots";
import { formatJobNumber, shortPersonName } from "@/lib/utils";

// Narrowing an all-day (or flexible) job to a 2-hour arrival window, shared by
// the website's server action (app/actions/mechanic-jobs.ts → setArrivalWindow)
// and the mechanic app (POST /api/mobile/v1/mechanic/bookings/[id]/arrival-window).
// The caller resolves the mechanic; this takes the id.

/** See OfferRefusalCode (lib/mechanics/offers.ts) — same idea, plus a bad body. */
export type ArrivalWindowRefusalCode = "invalid" | "not_found" | "forbidden" | "conflict" | "failed";

export type ArrivalWindowResult =
  | { ok: true }
  | { ok: false; code: ArrivalWindowRefusalCode; error: string };

/**
 * Narrow an ALL-DAY booking to one of the six 2-hour arrival windows (Task 21).
 *
 * The customer agreed to the whole day, so any window inside it needs no
 * consent from them — unlike `proposeReschedule`, this applies immediately and
 * the customer is simply told. It is ONE SHOT (owner decision 2026-09-03):
 * once a window is set the gate below refuses a second pick, and moving it
 * again means proposing a new time so the customer can agree.
 *
 * Storage is in place: `slot_window` becomes the 2-hour label and
 * `scheduled_at` its start (later on the same UK day, so the cancellation-fee
 * boundary can only move in the customer's favour). Every display path, and
 * the mobile app reading the row directly, shows the narrower window with no
 * further change. The original window is kept in the `arrival_window_set`
 * event (0052).
 *
 * A FLEXIBLE booking (Task 28) — the customer offered several days — takes
 * `dayKey` as well: one of `candidate_days`. The pick lands on that day (which
 * may be later than the earliest day `scheduled_at` was parked on), and
 * `candidate_days` is cleared; the offered set goes into the event payload.
 * Day and window are one move, and the same one shot.
 */
export async function setArrivalWindowFor(
  mechanicId: string,
  bookingId: string,
  window: string,
  dayKey?: string,
): Promise<ArrivalWindowResult> {
  const slot = twoHourSlotByWindow(window);
  if (!slot) return { ok: false, code: "invalid", error: "Pick one of the arrival windows." };
  if (dayKey !== undefined && !isDayKey(dayKey)) return { ok: false, code: "invalid", error: "Pick one of the days." };

  const admin = createAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select(
      `id, job_number, status, mechanic_id, scheduled_at, slot_window, candidate_days, reschedule_status,
       customer_id, customer_email, customer_name, customer_phone, repair_description`,
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return { ok: false, code: "not_found", error: "That job no longer exists." };
  if (booking.mechanic_id !== mechanicId)
    return { ok: false, code: "forbidden", error: "This isn't your job." };
  if (booking.status !== "confirmed")
    return {
      ok: false,
      code: "conflict",
      error:
        booking.status === "en_route" || booking.status === "in_progress"
          ? "This job is already under way, so the arrival window can't be changed now."
          : "Only confirmed jobs can have an arrival window set.",
    };
  if (booking.slot_window !== ALL_DAY_SLOT.window) {
    return {
      ok: false,
      code: "conflict",
      error: twoHourSlotByWindow(booking.slot_window)
        ? `You've already confirmed ${booking.slot_window} for this job. To move it, propose a new time so the customer can agree.`
        : "This job has a fixed time rather than an all-day window.",
    };
  }
  if (booking.reschedule_status === "proposed")
    return {
      ok: false,
      code: "conflict",
      error:
        "You've proposed a new time for this job. Wait for the customer's answer before choosing an arrival window.",
    };
  if (!booking.scheduled_at) return { ok: false, code: "conflict", error: "This job has no date yet." };

  // Which day the window is on. A flexible booking needs one of the offered
  // days; an ordinary all-day booking has exactly one day, and a `dayKey`
  // that says otherwise is a stale form.
  const flexible = isFlexibleBooking(booking);
  const candidateDays = flexible ? [...(booking.candidate_days as string[])].sort() : null;
  const bookingDay = londonDateKey(new Date(booking.scheduled_at));
  let targetDay: string;
  if (candidateDays) {
    if (!dayKey || !candidateDays.includes(dayKey))
      return { ok: false, code: "conflict", error: "Pick one of the days the customer offered." };
    targetDay = dayKey;
  } else {
    if (dayKey && dayKey !== bookingDay)
      return { ok: false, code: "conflict", error: "This job changed while you were choosing. Refresh and try again." };
    targetDay = bookingDay;
  }

  const now = new Date();
  const iso = slotIso(targetDay, slot.startHour);
  if (!isSlotBookable(targetDay, slot, now))
    return { ok: false, code: "conflict", error: `${slot.window} has already started or is too close. Pick a later window.` };

  // Recompute the calendar server-side: a clash with another timed job is a
  // hard refusal whatever the client showed. Off-hours is advisory only.
  const [calendar] = await loadArrivalWindowOptionsForDays(
    admin,
    mechanicId,
    { id: booking.id },
    [targetDay],
    now,
  );
  const option = calendar?.options.find((o) => o.window === slot.window);
  if (option?.clash)
    return {
      ok: false,
      code: "conflict",
      error: `That window overlaps job #${option.clash.jobNumber} (${option.clash.window}). Pick a different window.`,
    };

  // Guarded, atomic: every predicate re-asserted in the WHERE so a customer
  // reschedule landing in between (which nulls slot_window), a double submit,
  // or a status change can't be clobbered by a stale form. The offered days
  // are only named when there were some, so this works before 0057 too.
  const { data: updated, error } = await admin
    .from("bookings")
    .update({
      scheduled_at: iso,
      slot_window: slot.window,
      ...(candidateDays ? { candidate_days: null } : {}),
    })
    .eq("id", bookingId)
    .eq("mechanic_id", mechanicId)
    .eq("status", "confirmed")
    .eq("slot_window", ALL_DAY_SLOT.window)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, code: "failed", error: error.message };
  if (!updated)
    return { ok: false, code: "conflict", error: "This job changed while you were choosing. Refresh and try again." };

  const { error: eventErr } = await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "arrival_window_set",
    actor_id: mechanicId,
    actor_role: "mechanic",
    reason: candidateDays
      ? `Arrival window set to ${formatBookingDay(iso)} ${slot.window} (customer offered ${candidateDays.length} days)`
      : `Arrival window set to ${slot.window} (was ${ALL_DAY_SLOT.window})`,
    payload: {
      from_window: ALL_DAY_SLOT.window,
      to_window: slot.window,
      from: booking.scheduled_at,
      to: iso,
      day: targetDay,
      ...(candidateDays ? { candidate_days: candidateDays } : {}),
    },
  });
  if (eventErr) {
    // The booking is already narrowed and the customer is about to be told;
    // a missing audit row is worth a loud log, not a failed action.
    console.error(
      "[arrival-window] booking_events insert failed — has migration 0052 been applied?",
      eventErr,
    );
  }

  // Tell the customer: email + push + SMS, all best-effort.
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", mechanicId)
    .single();
  const mechanicName = profile?.full_name ?? "Your mechanic";
  const ref = formatJobNumber(booking.job_number);
  const whenLabel = formatBookingSlot(iso, slot.window);
  const dayLabel = formatBookingDay(iso);

  if (booking.customer_email) {
    const to = booking.customer_email;
    renderTemplateEmail("arrival_window_confirmed", {
      name: booking.customer_name ?? "there",
      mechanic: mechanicName,
      service: booking.repair_description ?? "Vehicle repair",
      ref,
      when: whenLabel,
      window: slot.window,
    })
      .then(({ subject, html }) => sendEmail({ to, subject, html }))
      .catch(console.error);
  }
  sendPushToCustomer(booking.customer_id, {
    title: "Your mechanic has confirmed an arrival window",
    body: `${shortPersonName(profile?.full_name)} will arrive ${slot.window} on ${dayLabel}.`,
    bookingId,
  }).catch(() => {});
  if (booking.customer_phone) {
    const phone = booking.customer_phone;
    renderSmsTemplate("arrival_window_confirmed", {
      mechanic: mechanicName,
      window: slot.window,
      day: dayLabel,
      ref,
    })
      .then((body) => sendSms({ to: phone, body }))
      .catch(() => {});
  }

  revalidatePath("/mechanic/jobs");
  revalidatePath(`/mechanic/jobs/${bookingId}`);
  revalidatePath("/mechanic/schedule");
  revalidatePath("/dashboard");
  revalidatePath(`/book/confirmed/${bookingId}`);
  return { ok: true };
}
