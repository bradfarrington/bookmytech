import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  scheduleRemindersForBooking,
  REMINDER_BOOKING_SELECT,
} from "@/lib/reminders/schedule-booking";

// Daily reminder scheduler (Task 11 Stage 1).
//
// Walks recently-completed bookings that don't yet have reminders seeded and
// derives their future service reminders (MOT due, annual service, seasonal,
// brake follow-up) into `reminder_schedules`. Reminders are also seeded inline
// at completion (completeAndCharge) — this cron is the back-fill/safety net that
// covers anything that slipped through and bookings completed before the feature
// existed. Idempotent via the (vehicle_reg, type, scheduled_for) unique key.
//
// Bounded: only looks at jobs completed in the last LOOKBACK_DAYS and processes
// at most BATCH that still lack reminders, so the per-booking DVLA lookups can't
// run away. The hourly send-reminders cron does the actual sending.
//
// NB project convention: scheduled work is a Next API route + vercel.json cron,
// NOT a Supabase edge function (the task spec's "edge function" wording predates
// that decision — see HANDOFF). Protected by CRON_SECRET when set.

const LOOKBACK_DAYS = 400;
const BATCH = 200;

async function runScheduler() {
  const admin = createAdminClient();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: completed } = await admin
    .from("bookings")
    .select(REMINDER_BOOKING_SELECT)
    .eq("status", "completed")
    .gte("completed_at", since)
    .order("completed_at", { ascending: false })
    .limit(1000);

  if (!completed?.length) return { scanned: 0, seeded: 0, reminders: 0 };

  // Skip bookings that already have reminders (any row tagged to them).
  const ids = completed.map((b) => b.id);
  const { data: existing } = await admin
    .from("reminder_schedules")
    .select("source_booking_id")
    .in("source_booking_id", ids);
  const seededIds = new Set((existing ?? []).map((r) => r.source_booking_id));

  const todo = completed.filter((b) => !seededIds.has(b.id)).slice(0, BATCH);

  let seeded = 0;
  let reminders = 0;
  for (const booking of todo) {
    const n = await scheduleRemindersForBooking(booking, admin);
    if (n > 0) {
      seeded += 1;
      reminders += n;
    }
  }

  return { scanned: todo.length, seeded, reminders };
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  try {
    const result = await runScheduler();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("schedule-reminders failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "scheduler failed" },
      { status: 500 },
    );
  }
}
