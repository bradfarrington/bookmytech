import { NextResponse, type NextRequest } from "next/server";
import { collectPushReceipts } from "@/lib/push/send";

// Push receipt sweep (Task 19 / P1).
//
// Expo answers a send with a ticket immediately and a receipt some minutes
// later, and it's the receipt that says `DeviceNotRegistered` when the app has
// been uninstalled or notifications revoked. Keep sending to those and Expo
// throttles the whole project, so every 15 minutes this collects the receipts
// for parked tickets (`push_receipts`, 0050) and deletes any token they
// condemn. See lib/push/send.ts.
//
// Protected by CRON_SECRET when set. Next API route + vercel.json cron, not a
// Supabase edge function (project convention).

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  try {
    const result = await collectPushReceipts();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("push-receipts failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "sweep failed" },
      { status: 500 },
    );
  }
}
