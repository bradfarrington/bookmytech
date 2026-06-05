import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { liftMechanicSuspension } from "@/lib/mechanics/suspend";

// Daily suspension auto-lift (Task 12 Stage 1). Any mechanic whose time-boxed
// suspension end date has passed is un-suspended — the flag is cleared, the
// history row stamped lifted, and they're emailed that they're back online.
// Indefinite suspensions (suspended_until is null) are never auto-lifted.
//
// Dispatch already treats an expired suspension as inactive (so offers resume
// even before this runs); this keeps the stored flag + UI honest. Next API
// route + vercel.json cron. Protected by CRON_SECRET when set.

async function runLift() {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: expired } = await admin
    .from("mechanics")
    .select("id")
    .eq("is_suspended", true)
    .not("suspended_until", "is", null)
    .lte("suspended_until", nowIso);

  if (!expired?.length) return { lifted: 0 };

  for (const m of expired) {
    await liftMechanicSuspension(admin, m.id, null);
  }
  return { lifted: expired.length };
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const result = await runLift();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("lift-suspensions failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "lift failed" },
      { status: 500 },
    );
  }
}
