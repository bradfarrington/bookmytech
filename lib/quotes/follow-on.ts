// A follow-on quote priced as a booking (Task 34). Pure `buildFollowOnQuote`
// turns an approved-or-open `follow_on` quote into the SAME `RepairsQuote`
// shape the funnel prices HaynesPro jobs into, so `prepareCheckoutFor` and
// `createBooking` need to know nothing about quotes beyond "where did the
// price come from". The figures are the quote's own snapshot — what the
// customer saw and approved — never re-derived from today's rate.
//
// Lines: a labour line is a job (its HaynesPro node when the book time filled
// it in, else "q:<line id>"); an "other" line rides as a fixed-price line;
// part lines become booking_parts rows at booking time, not repair lines.

import { computePrice } from "@/lib/pricing/calculate";
import { billableHours } from "@/lib/pricing/billable";
import { repairSummary } from "@/lib/bookings/repair-lines";
import type { RepairQuoteLine, RepairsQuote } from "@/lib/haynespro/repair-booking";
import type { QuoteView } from "./load";
import { isQuoteExpired } from "./status";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildFollowOnQuote(quote: QuoteView): RepairsQuote | null {
  if (quote.kind !== "follow_on" || quote.lines.length === 0) return null;

  const lines: RepairQuoteLine[] = [];
  const nodeIds: string[] = [];
  let rawHours = 0;
  for (const line of quote.lines) {
    if (line.kind === "part") continue;
    if (line.kind === "labour") {
      const hours = round2(line.hours ?? 0);
      rawHours += hours;
      const nodeId = line.nodeId ?? `q:${line.id}`;
      if (line.nodeId) nodeIds.push(line.nodeId);
      lines.push({
        nodeId,
        description: line.description,
        rawHours: hours,
        chargedHours: hours,
        linePence: line.linePence,
        itemId: nodeId,
        itemLabel: null,
      });
      continue;
    }
    lines.push({
      nodeId: `q:${line.id}`,
      description: line.description,
      rawHours: 0,
      chargedHours: 0,
      linePence: line.linePence,
      itemId: `q:${line.id}`,
      itemLabel: null,
      kind: "product",
    });
  }
  if (lines.length === 0) {
    // Parts only — the booking still needs a line to be named by.
    lines.push({
      nodeId: `q:${quote.id}`,
      description: quote.title ?? "Follow-on work",
      rawHours: 0,
      chargedHours: 0,
      linePence: quote.labourPence,
      itemId: `q:${quote.id}`,
      itemLabel: null,
      kind: "product",
    });
  }

  const combinedRawHours = round2(rawHours);
  const billedHours = combinedRawHours > 0 ? (billableHours(combinedRawHours) ?? 0) : 0;
  // Block out at least an hour for the visit even when the quote is parts-only.
  const visitHours = Math.max(1, billedHours);

  const breakdown = {
    ...computePrice({
      durationHours: visitHours,
      hourlyRatePence: quote.hourlyRatePence,
      overridePricePence: quote.labourPence,
      partsPence: quote.partsPence,
      commissionRate: quote.commissionRate,
      areaId: null,
    }),
    durationSource: "vehicle" as const,
    vehicleRawDurationHours: combinedRawHours,
  };

  return {
    itemIds: lines.map((l) => l.itemId),
    items: [...new Set(nodeIds)].map((id) => ({ id, label: null, nodeIds: [id] })),
    nodeIds: [...new Set(nodeIds)],
    lines,
    description: quote.title ?? repairSummary(lines.map((l) => l.description)),
    combinedRawHours,
    billedHours,
    combineSource: lines.length > 1 ? "sum" : null,
    breakdown,
    products: [],
    labourPence: quote.labourPence,
    fixedPence: 0,
    oil: null,
    visitHours,
  };
}

/** Why a follow-on quote can't be booked right now, or null when it can. */
export function followOnRefusal(quote: QuoteView): string | null {
  if (quote.kind !== "follow_on") return "That quote isn't for a return visit.";
  if (quote.followOnBookingId) return "You've already booked this return visit.";
  if (quote.status !== "sent" && quote.status !== "approved") return "This quote is no longer open.";
  if (isQuoteExpired(quote)) return "This quote has expired — ask your mechanic to send it again.";
  return null;
}
