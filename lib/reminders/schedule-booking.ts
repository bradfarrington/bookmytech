import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { deriveReminders } from "./derive";
import { lookupVehicleAction } from "@/app/actions/lookup-vehicle";

type Admin = ReturnType<typeof createAdminClient>;

interface BookingForReminders {
  id: string;
  vehicle_reg: string | null;
  customer_id: string | null;
  customer_email: string | null;
  completed_at: string | null;
  scheduled_at: string | null;
  service: { slug: string | null } | { slug: string | null }[] | null;
}

function serviceSlug(b: BookingForReminders): string | null {
  const s = Array.isArray(b.service) ? b.service[0] : b.service;
  return s?.slug ?? null;
}

/**
 * Derive + upsert the future service reminders for one completed booking.
 *
 * Best-effort: does a single DVLA/DVSA lookup to learn the MOT expiry (the data
 * isn't persisted on the booking), derives the reminder set, and upserts on the
 * (vehicle_reg, reminder_type, scheduled_for) natural key so re-running — at
 * completion and again from the daily scheduler — never duplicates. Returns the
 * number of reminder rows created (0 when all already existed).
 *
 * Callers wrap this in try/catch — a reminder hiccup must never break the
 * completion flow that triggers it.
 */
export async function scheduleRemindersForBooking(
  booking: BookingForReminders,
  admin: Admin,
  now: Date = new Date(),
): Promise<number> {
  if (!booking.vehicle_reg) return 0;
  const completedAt = booking.completed_at
    ? new Date(booking.completed_at)
    : booking.scheduled_at
      ? new Date(booking.scheduled_at)
      : now;

  // MOT expiry — best-effort. DVLA VES is the authoritative source; a miss just
  // means no MOT reminder for this car (the others still schedule).
  let motExpiry: Date | null = null;
  try {
    const res = await lookupVehicleAction(booking.vehicle_reg);
    if (res.ok && res.details.motExpiryDate) {
      const d = new Date(res.details.motExpiryDate);
      if (!Number.isNaN(d.getTime())) motExpiry = d;
    }
  } catch {
    // ignore — no MOT reminder
  }

  const reminders = deriveReminders({
    now,
    completedAt,
    serviceSlug: serviceSlug(booking),
    motExpiry,
  });
  if (reminders.length === 0) return 0;

  const rows = reminders.map((r) => ({
    customer_id: booking.customer_id,
    customer_email: booking.customer_email,
    vehicle_reg: booking.vehicle_reg,
    reminder_type: r.type,
    scheduled_for: r.scheduledFor.toISOString(),
    service_suggestion_slug: r.suggestionSlug,
    source_booking_id: booking.id,
  }));

  const { data, error } = await admin
    .from("reminder_schedules")
    .upsert(rows, {
      onConflict: "vehicle_reg,reminder_type,scheduled_for",
      ignoreDuplicates: true,
    })
    .select("id");
  if (error) {
    console.error("Failed to upsert reminders for booking", booking.id, error.message);
    return 0;
  }
  return data?.length ?? 0;
}

/** The select string callers should use to load a booking for this helper. */
export const REMINDER_BOOKING_SELECT =
  "id, vehicle_reg, customer_id, customer_email, completed_at, scheduled_at, service:services(slug)";
