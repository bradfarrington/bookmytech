// Quote arithmetic (Task 33). Pure — unit-tested — and the ONLY place a
// quote's figures are worked out, so the mechanic's builder, the server, the
// customer's approval page and the admin all agree.
//
//   labour line = hours × the platform hourly rate (the mechanic never sets
//                 a rate; the hours come from HaynesPro's book time when a job
//                 was picked from the tree, or are typed)
//   part line   = quantity × unit price (the catalogue's BMT price, or typed)
//   other line  = quantity × unit price
//   total       = Σ lines; fee = round(total × commission); payout = total − fee
//
// Same commission model as the base booking (owner decision 2026-06-04):
// commission on the whole figure, taken out of it. The rate is the BOOKING's
// snapshotted rate, so a Pro-tier mechanic keeps theirs.

export type QuoteLineKind = "labour" | "part" | "other";

export interface QuoteLineInput {
  kind: QuoteLineKind;
  description: string;
  /** Labour only. */
  hours?: number | null;
  /** Parts / other; labour is always 1. */
  quantity?: number | null;
  /** Parts / other; labour uses the hourly rate. */
  unitPence?: number | null;
  /** HaynesPro node whose book time filled `hours` in, when one did. */
  nodeId?: string | null;
  partId?: string | null;
  faultId?: string | null;
}

export interface PricedQuoteLine {
  position: number;
  kind: QuoteLineKind;
  description: string;
  hours: number | null;
  quantity: number;
  unitPence: number;
  linePence: number;
  nodeId: string | null;
  partId: string | null;
  faultId: string | null;
}

export interface QuoteTotals {
  lines: PricedQuoteLine[];
  labourPence: number;
  partsPence: number;
  totalPence: number;
  platformFeePence: number;
  mechanicPayoutPence: number;
}

export type PriceQuoteResult = { ok: true; totals: QuoteTotals } | { ok: false; error: string };

export const MAX_QUOTE_LINES = 20;
/** A sanity ceiling, not a business rule — a mistyped part price shouldn't reach the customer. */
export const MAX_QUOTE_PENCE = 500_000;
const MAX_DESCRIPTION = 200;
const MAX_HOURS = 24;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function splitCommission(totalPence: number, commissionRate: number): { platformFeePence: number; mechanicPayoutPence: number } {
  const rate = Number.isFinite(commissionRate) && commissionRate >= 0 ? commissionRate : 0;
  const platformFeePence = Math.round(totalPence * rate);
  return { platformFeePence, mechanicPayoutPence: totalPence - platformFeePence };
}

export function priceQuoteLines(
  input: readonly QuoteLineInput[],
  settings: { hourlyRatePence: number; commissionRate: number },
): PriceQuoteResult {
  if (input.length === 0) return { ok: false, error: "Add at least one line to the quote." };
  if (input.length > MAX_QUOTE_LINES) return { ok: false, error: `A quote can have up to ${MAX_QUOTE_LINES} lines.` };
  const rate = Math.round(settings.hourlyRatePence);
  if (!Number.isFinite(rate) || rate <= 0) return { ok: false, error: "The hourly rate isn't set." };

  const lines: PricedQuoteLine[] = [];
  let labourPence = 0;
  let partsPence = 0;
  input.forEach((line, index) => {
    const description = (line.description ?? "").trim().replace(/\s+/g, " ");
    if (!description) throw new QuoteInputError(`Line ${index + 1} needs a description.`);
    if (description.length > MAX_DESCRIPTION) throw new QuoteInputError(`Keep line ${index + 1}'s description under ${MAX_DESCRIPTION} characters.`);

    if (line.kind === "labour") {
      const hours = round2(Number(line.hours));
      if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_HOURS)
        throw new QuoteInputError(`Enter the hours for "${description}" (more than 0, up to ${MAX_HOURS}).`);
      const linePence = Math.round(hours * rate);
      labourPence += linePence;
      lines.push({
        position: index,
        kind: "labour",
        description,
        hours,
        quantity: 1,
        unitPence: rate,
        linePence,
        nodeId: line.nodeId?.trim() || null,
        partId: null,
        faultId: line.faultId?.trim() || null,
      });
      return;
    }

    const quantity = Math.round(Number(line.quantity ?? 1));
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 99)
      throw new QuoteInputError(`Enter a quantity for "${description}" (1 to 99).`);
    const unitPence = Math.round(Number(line.unitPence));
    if (!Number.isFinite(unitPence) || unitPence < 0)
      throw new QuoteInputError(`Enter a price for "${description}".`);
    const linePence = quantity * unitPence;
    if (line.kind === "part") partsPence += linePence;
    else labourPence += linePence;
    lines.push({
      position: index,
      kind: line.kind,
      description,
      hours: null,
      quantity,
      unitPence,
      linePence,
      nodeId: null,
      partId: line.kind === "part" ? line.partId?.trim() || null : null,
      faultId: line.faultId?.trim() || null,
    });
  });

  const totalPence = labourPence + partsPence;
  if (totalPence <= 0) return { ok: false, error: "The quote comes to £0 — add a price to at least one line." };
  if (totalPence > MAX_QUOTE_PENCE)
    return { ok: false, error: `That's over £${MAX_QUOTE_PENCE / 100} — check the prices.` };

  return {
    ok: true,
    totals: { lines, labourPence, partsPence, totalPence, ...splitCommission(totalPence, settings.commissionRate) },
  };
}

/** Thrown inside priceQuoteLines for a per-line problem; callers turn it into `{ ok: false }` via `safePriceQuoteLines`. */
export class QuoteInputError extends Error {}

export function safePriceQuoteLines(
  input: readonly QuoteLineInput[],
  settings: { hourlyRatePence: number; commissionRate: number },
): PriceQuoteResult {
  try {
    return priceQuoteLines(input, settings);
  } catch (err) {
    if (err instanceof QuoteInputError) return { ok: false, error: err.message };
    throw err;
  }
}

/**
 * A reduction (Task 33): the mechanic lowers the price. Negative figures, the
 * same split, clamped so the customer can never be owed more than was held.
 */
export function priceReduction(
  amountPence: number,
  settings: { commissionRate: number; maxPence: number },
): { ok: true; totalPence: number; platformFeePence: number; mechanicPayoutPence: number } | { ok: false; error: string } {
  const amount = Math.round(amountPence);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter the amount to take off." };
  if (amount > settings.maxPence)
    return { ok: false, error: `You can take off up to £${(settings.maxPence / 100).toFixed(2)} on this job.` };
  const split = splitCommission(amount, settings.commissionRate);
  return {
    ok: true,
    totalPence: -amount,
    platformFeePence: -split.platformFeePence,
    mechanicPayoutPence: -split.mechanicPayoutPence,
  };
}
