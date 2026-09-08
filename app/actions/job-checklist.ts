"use server";

import { revalidatePath } from "next/cache";
import { requireMechanic } from "@/lib/mechanics/require-mechanic";
import { ownedBooking } from "@/lib/mechanics/owned-booking";
import { repairLinesFor, type BookingRepairRow } from "@/lib/bookings/repair-lines";
import { isValidResult, type ChecklistResult } from "@/lib/checklists/checklists";
import { loadBookingChecklists, productIdsInLines } from "@/lib/checklists/load";

// The mechanic answers a checklist item (Task 32): Checked / N/A on a
// service, Pass / Advisory / Fail / Not checked on an inspection, with an
// optional comment. One row per (booking, item), upserted, so a tap is saved
// on its own and a stale form can't lose the rest. Same trust model as every
// mechanic write: requireMechanic() + the service-role ownership re-read,
// then a service-role write (mechanics have no policies on the table).

export type ChecklistActionResult = { ok: true } | { ok: false; error: string };

const MAX_COMMENT = 500;

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

  const owned = await ownedBooking(input.bookingId, guard.mechanicId);
  if (!owned.ok) return owned;
  const { booking, admin } = owned;
  if (booking.status !== "in_progress")
    return { ok: false, error: "Begin work on the job before filling in the checklist." };

  // Which checklists this booking has, and is the item one of theirs?
  const [{ data: row }, { data: lineRows }] = await Promise.all([
    admin.from("bookings").select("repair_node_id, repair_description").eq("id", input.bookingId).single(),
    admin.from("booking_repairs").select("*").eq("booking_id", input.bookingId).order("position"),
  ]);
  const lines = repairLinesFor(row ?? {}, (lineRows ?? null) as BookingRepairRow[] | null);
  const checklists = await loadBookingChecklists(admin, input.bookingId, productIdsInLines(lines));
  const owner = checklists.find((c) => c.items.some((i) => i.id === input.itemId));
  if (!owner) return { ok: false, error: "That item isn't on this job's checklist." };

  const result = input.result == null || input.result === "" ? null : input.result;
  if (result != null && !isValidResult(owner.checklist.kind, result))
    return { ok: false, error: "That answer isn't one of the options." };
  const comment = input.comment === undefined ? undefined : (input.comment ?? "").trim().slice(0, MAX_COMMENT) || null;

  const existing = owner.results.find((r) => r.item_id === input.itemId);
  const finalResult: ChecklistResult | null = (result ?? existing?.result ?? null) as ChecklistResult | null;
  if (!finalResult) return { ok: false, error: "Choose an answer for this item first." };

  const { error } = await admin.from("booking_checklist_results").upsert(
    {
      booking_id: input.bookingId,
      item_id: input.itemId,
      result: finalResult,
      ...(comment !== undefined ? { comment } : {}),
      updated_by: guard.mechanicId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "booking_id,item_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/mechanic/jobs/${input.bookingId}`);
  revalidatePath(`/dashboard/bookings/${input.bookingId}/report`);
  revalidatePath(`/admin/jobs/${input.bookingId}`);
  return { ok: true };
}
