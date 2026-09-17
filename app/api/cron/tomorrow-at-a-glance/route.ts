import { NextResponse, type NextRequest } from "next/server";
import { sendTomorrowAtAGlance } from "@/lib/mechanics/daily-pushes";
import { londonHour } from "@/lib/slots";

// "Tomorrow at a glance" (Task 66) — at 8pm UK time, every mechanic with a job
// tomorrow gets one push summing it up: "4 jobs · £340 · first at 08:30 in
// SE21". The push, and the once-per-day lock, are in
// lib/mechanics/daily-pushes.ts.
//
// Vercel crons run on UTC, and 8pm in London is 20:00 UTC in winter and 19:00
// in summer. So this runs EVERY hour and does nothing unless the UK wall clock
// says 8pm — no schedule to remember to change twice a year. `?force=1` skips
// the clock for a manual run; the lock still stops a repeat.
//
// Next API route + vercel.json cron. Protected by CRON_SECRET when set.

const SEND_HOUR = 20;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  }

  const force = request.nextUrl.searchParams.get("force") === "1";
  if (!force && londonHour(new Date()) !== SEND_HOUR) {
    return NextResponse.json({ ok: true, skipped: "not 8pm in London" });
  }

  try {
    const result = await sendTomorrowAtAGlance();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("tomorrow-at-a-glance failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "send failed" },
      { status: 500 },
    );
  }
}
