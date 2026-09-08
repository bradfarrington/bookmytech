import { NextResponse, type NextRequest } from "next/server";
import { expireStaleQuotes } from "@/lib/quotes/expire";

// Hourly: lapse quotes the customer never answered (Task 33). Same
// CRON_SECRET guard as the other crons — open when no secret is set (local
// dev) so it can be curled.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const result = await expireStaleQuotes();
  return NextResponse.json({ ok: true, ...result });
}
