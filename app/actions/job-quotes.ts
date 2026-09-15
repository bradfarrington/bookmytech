"use server";

import { requireMechanic } from "@/lib/mechanics/require-mechanic";
import {
  createQuote,
  searchJobRepairTimes,
  suggestQuoteParts,
  withdrawQuote,
  type CreateQuoteInput,
} from "@/lib/quotes/mechanic";

// The mechanic's quote tool (Task 33): thin wrappers that resolve the mechanic
// from the cookie session and hand off to lib/quotes/mechanic.ts. The mechanic
// id is never an argument — see app/actions/customer-bookings.ts for why.

export async function createQuoteAction(input: CreateQuoteInput) {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  return createQuote(guard.mechanicId, input);
}

export async function withdrawQuoteAction(quoteId: string) {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  return withdrawQuote(guard.mechanicId, quoteId);
}

export async function searchJobRepairTimesAction(input: { bookingId: string; query: string }) {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  return searchJobRepairTimes(guard.mechanicId, input.bookingId, input.query);
}

/** Alliance Automotive parts for the labour on a quote, priced for this job's car (Task 43). */
export async function suggestQuotePartsAction(input: { bookingId: string; nodeIds: string[] }) {
  const guard = await requireMechanic();
  if (!guard.ok) return { ok: false as const, error: guard.error };
  return suggestQuoteParts(guard.mechanicId, input.bookingId, Array.isArray(input.nodeIds) ? input.nodeIds : []);
}
