"use server";

import { requireMechanic } from "@/lib/mechanics/require-mechanic";
import {
  endJobOnSite,
  previewRevision,
  searchJobCatalogue,
  sendRevision,
  withdrawRevision,
  type RevisionInput,
} from "@/lib/revisions/mechanic";
import type { OnSiteCharge } from "@/lib/revisions/status";

// The mechanic's "change what's being done" tool (Task 37): thin wrappers
// that resolve the mechanic from the cookie session and hand off to
// lib/revisions/mechanic.ts. The mechanic id is never an argument — see
// app/actions/customer-bookings.ts for why.

export async function previewRevisionAction(input: RevisionInput) {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  return previewRevision(guard.mechanicId, input);
}

export async function sendRevisionAction(input: RevisionInput & { reason: string; note?: string | null }) {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  return sendRevision(guard.mechanicId, input);
}

export async function withdrawRevisionAction(revisionId: string) {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  return withdrawRevision(guard.mechanicId, revisionId);
}

export async function endJobOnSiteAction(input: { bookingId: string; charge: OnSiteCharge; note?: string | null }) {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  return endJobOnSite(guard.mechanicId, input);
}

export async function searchJobCatalogueAction(input: { bookingId: string; query: string }) {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  return searchJobCatalogue(guard.mechanicId, input.bookingId, input.query);
}
