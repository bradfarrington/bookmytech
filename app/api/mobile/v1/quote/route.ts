import { quoteRepair } from "@/lib/haynespro/repair-booking";
import { enforceCatalogueLimits } from "@/lib/mobile/catalogue-limits";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/mobile/v1/quote — the price for one repair on one vehicle.
// Unauthenticated (the app lets people price a job before making an account).
//
// Body: { reg, repairNodeId }
// 200:  { ok: true, quote } | { ok: false, code: "not_priceable", message }
//       Same convention as /vehicle/lookup and /repairs/tree: a repair we
//       can't price is a successful request with a negative answer.
//
// Thin wrapper over quoteRepair, which is the SAME function the web funnel
// prices with — match, slot, checkout hold and booking create each re-derive
// the quote from (reg, nodeId) server-side. The figure returned here is
// therefore what gets charged, and the client never supplies a price or a
// duration. Do not compute anything on this side of the wire.

interface QuoteBody {
  reg?: unknown;
  repairNodeId?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<QuoteBody>(request);
  if (!parsed.ok) return parsed.response;

  const reg = typeof parsed.body.reg === "string" ? parsed.body.reg.trim() : "";
  const repairNodeId =
    typeof parsed.body.repairNodeId === "string" ? parsed.body.repairNodeId.trim() : "";

  if (!reg) {
    return apiError("Enter your registration number.", 400);
  }
  if (!repairNodeId) {
    return apiError("Choose the repair you need first.", 400);
  }

  const limited = await enforceCatalogueLimits(request);
  if (limited) return limited;

  const quote = await quoteRepair(reg, repairNodeId, createAdminClient());

  // quoteRepair returns null for every "can't price it" reason — unmatched
  // vehicle, unknown or admin-hidden node, a group with no book time, HaynesPro
  // down. The customer's next move is the same in all of them, so they share
  // one code and one sentence rather than leaking which it was.
  if (!quote) {
    return apiOk({
      ok: false as const,
      code: "not_priceable" as const,
      message:
        "We can't price that repair for this vehicle. Please choose another, " +
        "or get in touch and we'll sort it for you.",
    });
  }

  return apiOk({
    ok: true as const,
    quote: {
      nodeId: quote.nodeId,
      description: quote.description,
      rawHours: quote.rawHours,
      billedHours: quote.billedHours,
      hourlyRatePence: quote.breakdown.hourlyRatePence,
      partsPence: quote.breakdown.partsPence,
      totalPence: quote.breakdown.totalPence,
    },
  });
}
