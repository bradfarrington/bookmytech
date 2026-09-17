import "server-only";
import { revalidatePath } from "next/cache";
import { repairLinesFor, type BookingRepairRow } from "@/lib/bookings/repair-lines";
import {
  checklistProgress,
  isValidResult,
  type ChecklistProgress,
  type ChecklistResult,
} from "@/lib/checklists/checklists";
import { loadBookingChecklists, productIdsInLines } from "@/lib/checklists/load";
import { completionGate } from "@/lib/mechanics/job-progress";
import { ownedBooking } from "@/lib/mechanics/owned-booking";
import { refuse, type MechanicRefusal } from "@/lib/mechanics/refusal";

// The mechanic answers a checklist item (Task 32): Checked / N/A on a
// service, Pass / Advisory / Fail / Not checked on an inspection, with an
// optional comment. One row per (booking, item), upserted, so a tap is saved
// on its own and a stale form can't lose the rest.
//
// Shared by the website's `saveChecklistResult` (app/actions/job-checklist.ts)
// and the mechanic app's POST …/mechanic/bookings/[id]/checklist (Task 67).
// Same trust model as every mechanic write: the caller resolves the mechanic,
// ownership is re-read under the service role, and the write is service-role
// (mechanics have no policies on the table).

export type SaveChecklistResult =
  | {
      ok: true;
      /** The item's checklist, counted with this answer in. */
      progress: ChecklistProgress;
      /** Only when asked for (`withBlocker`) — see `completionGate`. */
      completeBlocker: string | null;
    }
  | MechanicRefusal;

const MAX_COMMENT = 500;

export async function saveChecklistResultFor(
  mechanicId: string,
  input: {
    bookingId: string;
    itemId: string;
    /** Omit to keep the current answer and only change the comment. */
    result?: string | null;
    /** Omit to keep the current comment. */
    comment?: string | null;
  },
  options: {
    /**
     * Also work out what would still stop the job completing. The app wants it
     * after every tap; the website re-renders the page instead, so it skips
     * the extra reads.
     */
    withBlocker?: boolean;
  } = {},
): Promise<SaveChecklistResult> {
  const owned = await ownedBooking(input.bookingId, mechanicId);
  if (!owned.ok) return owned;
  const { booking, admin } = owned;
  if (booking.status !== "in_progress")
    return refuse("conflict", "Begin work on the job before filling in the checklist.");

  // Which checklists this booking has, and is the item one of theirs?
  const [{ data: row }, { data: lineRows }] = await Promise.all([
    admin.from("bookings").select("repair_node_id, repair_description, mileage").eq("id", input.bookingId).single(),
    admin.from("booking_repairs").select("*").eq("booking_id", input.bookingId).order("position"),
  ]);
  const lines = repairLinesFor(row ?? {}, (lineRows ?? null) as BookingRepairRow[] | null);
  const checklists = await loadBookingChecklists(admin, input.bookingId, productIdsInLines(lines));
  const owner = checklists.find((c) => c.items.some((i) => i.id === input.itemId));
  if (!owner) return refuse("not_found", "That item isn't on this job's checklist.");

  const result = input.result == null || input.result === "" ? null : input.result;
  if (result != null && !isValidResult(owner.checklist.kind, result))
    return refuse("invalid", "That answer isn't one of the options.");
  const comment = input.comment === undefined ? undefined : (input.comment ?? "").trim().slice(0, MAX_COMMENT) || null;

  const existing = owner.results.find((r) => r.item_id === input.itemId);
  const finalResult: ChecklistResult | null = (result ?? existing?.result ?? null) as ChecklistResult | null;
  if (!finalResult) return refuse("invalid", "Choose an answer for this item first.");

  const { error } = await admin.from("booking_checklist_results").upsert(
    {
      booking_id: input.bookingId,
      item_id: input.itemId,
      result: finalResult,
      ...(comment !== undefined ? { comment } : {}),
      updated_by: mechanicId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "booking_id,item_id" },
  );
  if (error) return refuse("failed", error.message);

  revalidatePath(`/mechanic/jobs/${input.bookingId}`);
  revalidatePath(`/dashboard/bookings/${input.bookingId}/report`);
  revalidatePath(`/admin/jobs/${input.bookingId}`);

  // Count with the new answer in, from what was already loaded — a mechanic
  // taps through 50–170 of these, so no second read of the whole checklist.
  owner.results = [
    ...owner.results.filter((r) => r.item_id !== input.itemId),
    { item_id: input.itemId, result: finalResult, comment: comment === undefined ? (existing?.comment ?? null) : comment },
  ];
  owner.progress = checklistProgress(owner.items, owner.results);

  const completeBlocker = options.withBlocker
    ? (await completionGate(admin, input.bookingId, row?.mileage ?? null, checklists)).blocker
    : null;
  return { ok: true, progress: owner.progress, completeBlocker };
}
