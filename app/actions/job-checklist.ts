"use server";

import { requireMechanic } from "@/lib/mechanics/require-mechanic";
import { saveChecklistResultFor } from "@/lib/checklists/save-result";

// The mechanic answers a checklist item (Task 32). The work lives in
// lib/checklists/save-result.ts, shared with the mechanic app's route handler
// (Task 67); this action only resolves the mechanic from the cookie session.

export type ChecklistActionResult = { ok: true } | { ok: false; error: string };

export async function saveChecklistResult(input: {
  bookingId: string;
  itemId: string;
  /** Omit to keep the current answer and only change the comment. */
  result?: string | null;
  /** Omit to keep the current comment. */
  comment?: string | null;
}): Promise<ChecklistActionResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  const result = await saveChecklistResultFor(guard.mechanicId, input);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
