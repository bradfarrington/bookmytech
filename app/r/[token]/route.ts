import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Reminder click-through (Task 11 Stage 1).
//
// The CTA in every reminder email/SMS points here. We stamp acted_on_at (so the
// admin can measure reminder → booking conversion) and deep-link the customer
// into the booking flow, pre-filled from their car's most recent booking. An
// unknown/[]-token still bounces somewhere sensible rather than erroring.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const base = request.nextUrl.origin;
  const admin = createAdminClient();

  const { data: reminder } = await admin
    .from("reminder_schedules")
    .select("id, vehicle_reg, acted_on_at")
    .eq("token", token)
    .maybeSingle();

  if (!reminder) {
    return NextResponse.redirect(new URL("/", base));
  }

  // Mark click-through the first time only.
  if (!reminder.acted_on_at) {
    await admin
      .from("reminder_schedules")
      .update({ acted_on_at: new Date().toISOString() })
      .eq("id", reminder.id);
  }

  // Pull the latest booking for this car to pre-fill the postcode, then land
  // on vehicle confirmation — from there the customer browses the repairs for
  // their car. (The old flow could deep-link a suggested service straight to
  // the slot picker; repairs are per-vehicle so the picker is the entry now.)
  const { data: lastBooking } = await admin
    .from("bookings")
    .select("postcode")
    .eq("vehicle_reg", reminder.vehicle_reg)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const params2 = new URLSearchParams({ reg: reminder.vehicle_reg });
  if (lastBooking?.postcode) params2.set("postcode", lastBooking.postcode);

  return NextResponse.redirect(new URL(`/book/vehicle?${params2.toString()}`, base));
}
