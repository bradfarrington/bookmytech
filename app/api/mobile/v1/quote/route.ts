import { PARTS_UNAVAILABLE_MESSAGE, quoteRepairsResult } from "@/lib/haynespro/repair-booking";
import { customerPartLines } from "@/lib/parts/quote-parts";
import { MAX_REPAIRS_PER_BOOKING, readRepairIdList } from "@/lib/bookings/repair-ids";
import { enforceCatalogueLimits } from "@/lib/mobile/catalogue-limits";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/mobile/v1/quote — the price for one repair, or several booked
// together, on one vehicle. Unauthenticated (the app lets people price a job
// before making an account).
//
// Body: { reg, repairNodeId }                — one job (the original contract)
//       { reg, repairNodeIds: [id, …] }      — several jobs priced as one
//                                              visit (Task 24; wins over
//                                              repairNodeId when non-empty)
// 200:  { ok: true, quote } | { ok: false, code: "not_priceable", message }
//       Same convention as /vehicle/lookup and /repairs/tree: a repair we
//       can't price is a successful request with a negative answer.
//
// A `repairNodeId` request returns EXACTLY what it did before Task 24:
//   quote: { nodeId, description, rawHours, billedHours, hourlyRatePence,
//            partsPence, totalPence }
// A `repairNodeIds` request returns those same seven fields describing the
// whole visit (nodeId = the first job, description = a summary, rawHours =
// the combined book time) PLUS:
//   lines:            [{ nodeId, description, rawHours, chargedHours, linePence }]
//                     chargedHours 0 = covered by another job in the basket
//   combinedRawHours: book time for the whole visit
//   combineSource:    "sum" — each job's book time added up (the default)
//                     "haynespro" — HaynesPro's basket calculation removed
//                     the overlap between jobs (an admin setting)
// The 1-hour minimum applies once to the whole visit, not per job.
//
// Since Task 31 an id may also be a PRODUCT ("p:<uuid>" — a diagnostic, a
// service, an inspection; see /repairs/tree). ADDITIVE on both shapes:
//   oil:          { litres, pencePerLitre, pence, source, label } | null —
//                 the engine-oil line a servicing product adds
//   products:     [{ id, name, pricePence, labourHours, durationHours }]
//   labourPence / fixedPence / visitHours
// and each line may carry kind: "product" + productId. `nodeId` may be a
// "p:" id when the first thing chosen was a product.
//
// Since Task 43 repairs carry their supplier parts. ADDITIVE on both shapes:
//   parts:        [{ nodeId, name, brand, position, quantity, unitPence,
//                    linePence }] — one per job, part group and axle
//                 (position "front" | "rear" | null). `partsPence` is oil
//                 plus these, and `totalPence` includes it.
// A repair whose parts can't be priced right now is `not_priceable` with a
// parts-specific `message`; the code is unchanged.
//
// Thin wrapper over quoteRepairsResult, which is the SAME function the web
// funnel prices with — match, slot, checkout hold and booking create each
// re-derive the quote from (reg, nodes) server-side. The figure returned here
// is therefore what gets charged, and the client never supplies a price or a
// duration. Do not compute anything on this side of the wire.

interface QuoteBody {
  reg?: unknown;
  repairNodeId?: unknown;
  repairNodeIds?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<QuoteBody>(request);
  if (!parsed.ok) return parsed.response;

  const reg = typeof parsed.body.reg === "string" ? parsed.body.reg.trim() : "";
  const repairNodeId =
    typeof parsed.body.repairNodeId === "string" ? parsed.body.repairNodeId.trim() : "";
  const list = readRepairIdList(parsed.body.repairNodeIds);

  if (!reg) {
    return apiError("Enter your registration number.", 400);
  }
  if (list === null) {
    return apiError("Choose the repairs you need first.", 400);
  }
  const useList = list.length > 0;
  const ids = useList ? list : repairNodeId ? [repairNodeId] : [];
  if (ids.length === 0) {
    return apiError("Choose the repair you need first.", 400);
  }
  if (ids.length > MAX_REPAIRS_PER_BOOKING) {
    return apiError(`You can book up to ${MAX_REPAIRS_PER_BOOKING} jobs in one visit.`, 400);
  }

  const limited = await enforceCatalogueLimits(request);
  if (limited) return limited;

  const result = await quoteRepairsResult(reg, ids, createAdminClient());

  // Every "can't price it" reason shares one code — unmatched vehicle, unknown
  // or admin-hidden node, a group with no book time, HaynesPro down. Only a
  // part that can't be priced right now gets its own sentence, because the
  // customer's next move differs: try again shortly.
  if (!result.ok) {
    return apiOk({
      ok: false as const,
      code: "not_priceable" as const,
      message:
        result.reason === "parts_unavailable"
          ? PARTS_UNAVAILABLE_MESSAGE
          : ids.length > 1
            ? "We can't price one of those repairs for this vehicle. Please check the jobs you've chosen, " +
              "or get in touch and we'll sort it for you."
            : "We can't price that repair for this vehicle. Please choose another, " +
              "or get in touch and we'll sort it for you.",
    });
  }
  const quote = result.quote;

  const first = quote.lines[0];
  const base = {
    nodeId: first.nodeId,
    description: quote.description,
    rawHours: useList ? quote.combinedRawHours : first.rawHours,
    billedHours: quote.billedHours,
    hourlyRatePence: quote.breakdown.hourlyRatePence,
    partsPence: quote.breakdown.partsPence,
    totalPence: quote.breakdown.totalPence,
    // ADDITIVE (Task 31): the engine-oil line and the products in the visit.
    oil: quote.oil,
    products: quote.products.map((p) => ({
      id: p.id,
      name: p.name,
      pricePence: p.pricePence,
      labourHours: p.labourHours,
      durationHours: p.durationHours,
      category: p.category,
    })),
    labourPence: quote.labourPence,
    fixedPence: quote.fixedPence,
    visitHours: quote.visitHours,
    // ADDITIVE (Task 43): the supplier parts in the price. Same mapper as
    // /checkout/prepare, so the two can't drift.
    parts: customerPartLines(quote.parts),
  };

  return apiOk({
    ok: true as const,
    quote: useList
      ? {
          ...base,
          lines: quote.lines,
          // ADDITIVE (Task 26): what each chosen id stood for — a combined
          // repair ("b:…") expands to several HaynesPro jobs, and its lines
          // carry the same itemId / itemLabel.
          items: quote.items,
          combinedRawHours: quote.combinedRawHours,
          combineSource: quote.combineSource ?? "sum",
        }
      : base,
  });
}
