import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redispatchPending } from "@/lib/dispatch/dispatch";
import { setAvailabilityFor } from "@/lib/mechanics/availability";
import { ANDROID_UPDATES_CHANNEL } from "@/lib/push/format";
import { sendPushToMechanic } from "@/lib/push/send";

// Timed offline (Task 66), every 5 minutes. A mechanic who went offline "for 30
// minutes", "for an hour" or "until my next shift" has a `resume_online_at`
// (0083); once it passes, this puts them back online through the SAME function
// their own toggle uses (lib/mechanics/availability.ts) — payouts gate,
// suspension check, `online_at` — and tells their phone.
//
// Each mechanic is CLAIMED first, by clearing the column in an update that only
// matches while they are still offline and due. So two overlapping runs can't
// both bring someone back, and a mechanic the gate refuses (payouts lapsed,
// suspended since) is not retried every five minutes for ever: they stay
// offline and the app's "Back online at…" line goes away.
//
// Waiting jobs are re-offered once at the end, not once per mechanic.
// Next API route + vercel.json cron. Protected by CRON_SECRET when set.

async function runResume() {
  const admin = createAdminClient();

  const { data: due, error } = await admin
    .from("mechanics")
    .update({ resume_online_at: null })
    .eq("status", "offline")
    .lte("resume_online_at", new Date().toISOString())
    .select("id");
  if (error) throw error;
  if (!due?.length) return { due: 0, resumed: 0 };

  let resumed = 0;
  for (const { id } of due) {
    const result = await setAvailabilityFor(admin, id, "online", { skipRedispatch: true });
    if (!result.ok) {
      console.warn("[resume-online] left offline", id, result.error);
      continue;
    }
    resumed += 1;
    await sendPushToMechanic(id, {
      title: "You're back online",
      body: "We'll send offers through as they come in.",
      data: { type: "status" },
      channelId: ANDROID_UPDATES_CHANNEL,
    });
  }

  if (resumed > 0) {
    try {
      await redispatchPending();
    } catch (err) {
      console.error("[resume-online] redispatch failed", err);
    }
  }
  return { due: due.length, resumed };
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const result = await runResume();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("resume-online failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "resume failed" },
      { status: 500 },
    );
  }
}
