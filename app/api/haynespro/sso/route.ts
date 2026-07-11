import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mintTouchUrl, SSO_SUBJECTS, type SsoSubject } from "@/lib/haynespro/sso";
import { resolveVehicle } from "@/lib/haynespro/vehicle";

// GET /api/haynespro/sso?booking=<id>&subject=<repairmanuals|maintenance|electronics>
//
// Mints a one-time WorkshopData Touch link for the booking's vehicle and
// redirects into it (Task 16 Stage F). Links are single-use so this must run
// per click — the job card's buttons point straight here with target=_blank.
//
// Access: the booking's assigned mechanic, or an admin.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const bookingId = request.nextUrl.searchParams.get("booking") ?? "";
  const subjectParam = request.nextUrl.searchParams.get("subject") ?? "";
  const subject: SsoSubject | null =
    subjectParam in SSO_SUBJECTS ? (subjectParam as SsoSubject) : null;

  if (!bookingId) {
    return NextResponse.json({ error: "Missing booking" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const admin = createAdminClient();
  const [{ data: booking }, { data: profile }] = await Promise.all([
    admin
      .from("bookings")
      .select("id, mechanic_id, vehicle_reg")
      .eq("id", bookingId)
      .maybeSingle(),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
  ]);

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  const allowed = booking.mechanic_id === user.id || profile?.role === "admin";
  if (!allowed) {
    return NextResponse.json({ error: "Not your job" }, { status: 403 });
  }

  // Pre-select the booking vehicle when it resolves; Touch falls back to its
  // own vehicle identification when it doesn't.
  let carTypeId: number | null = null;
  if (booking.vehicle_reg) {
    const vehicle = await resolveVehicle(booking.vehicle_reg, admin);
    carTypeId = vehicle?.carTypeId ?? null;
  }

  const url = await mintTouchUrl({
    username: `bmt_${user.id.replaceAll("-", "").slice(0, 28)}`,
    carTypeId,
    subject,
  });

  if (!url) {
    return NextResponse.json(
      { error: "Couldn't open technical data. Please try again." },
      { status: 502 },
    );
  }

  return NextResponse.redirect(url);
}
