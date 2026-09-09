import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { loadQuotesForBooking } from "@/lib/quotes/load";
import { approvedExtras } from "./snapshot";
import { diffRevision } from "./diff";
import type { RevisionView } from "./load";
import { notifyMechanicRevisionOutcome, type RevisionBookingContact } from "./notify";

// The one place an approved revision is written onto the booking (Task 37) —
// reached from the customer's approve (no card needed) and from the card
// confirmation (difference authorised). Idempotent on the revision's status.
//
// What changes: the job lines (booking_repairs), the parts (booking_parts —
// kept rows keep their sourcing and status), the booking's description,
// duration, oil and the five money figures — set to the `after` snapshot
// plus whatever approved Task 33 extra work already sat on top of the job.
// The revision's own hold quote is NOT extra work and is left out of that
// sum: it is the payment vehicle for the difference, and completeAndCharge
// captures the base hold for total − Σ approved quotes = before.

export type ApplyResult = { ok: true } | { ok: false; error: string };

export async function applyRevision(
  admin: ReturnType<typeof createAdminClient>,
  revision: RevisionView,
  actor: { id: string | null; role: "customer" },
  meta: { paymentIntentId?: string | null } = {},
): Promise<ApplyResult> {
  const { data: current } = await admin
    .from("bookings")
    .select(
      "id, job_number, status, mechanic_id, customer_id, customer_email, customer_name, customer_phone, total_pence, base_price_pence, parts_price_pence, platform_fee_pence, mechanic_payout_pence",
    )
    .eq("id", revision.bookingId)
    .single();
  if (!current) return { ok: false, error: "That booking no longer exists." };

  const { after } = revision;
  const quotes = await loadQuotesForBooking(admin, revision.bookingId);
  const extras = approvedExtras(quotes, new Set(revision.holdQuoteId ? [revision.holdQuoteId] : []));

  // Flip the revision first — the guard against a double apply.
  const now = new Date().toISOString();
  const { data: flipped, error: flipError } = await admin
    .from("job_revisions")
    .update({ status: "approved", responded_at: now, updated_at: now })
    .eq("id", revision.id)
    .eq("status", "sent")
    .select("id");
  if (flipError) return { ok: false, error: flipError.message };
  if (!flipped || flipped.length === 0) return { ok: true }; // already applied

  // --- Job lines: replace. One line lives on the booking row alone (the
  // repairLinesFor invariant), several become booking_repairs rows.
  await admin.from("booking_repairs").delete().eq("booking_id", revision.bookingId);
  if (after.lines.length > 1) {
    const { error: linesError } = await admin.from("booking_repairs").insert(
      after.lines.map((line, index) => ({
        booking_id: revision.bookingId,
        position: index,
        node_id: line.nodeId,
        description: line.description,
        raw_hours: line.rawHours,
        charged_hours: line.chargedHours,
        line_pence: line.linePence,
        ...(line.itemLabel ? { item_id: line.itemId, item_label: line.itemLabel } : {}),
        ...(line.kind === "product" ? { kind: "product" } : {}),
      })),
    );
    if (linesError) console.error("[revisions] repair lines insert failed", revision.id, linesError);
  }

  // --- Parts: keep what's still there, drop what was removed, add the rest.
  const keepIds = after.parts.map((p) => p.id).filter((v): v is string => Boolean(v));
  const { data: existing } = await admin.from("booking_parts").select("id").eq("booking_id", revision.bookingId);
  const toDelete = (existing ?? []).map((r) => r.id as string).filter((id) => !keepIds.includes(id));
  if (toDelete.length) await admin.from("booking_parts").delete().in("id", toDelete);
  const added = after.parts.filter((p) => !p.id);
  if (added.length) {
    const { error: partsError } = await admin.from("booking_parts").insert(
      added.map((p) => ({
        booking_id: revision.bookingId,
        part_id: p.partId,
        part_name: p.name,
        quantity: p.quantity,
        unit_price_pence: p.unitPence,
        total_pence: p.linePence,
        sourcing: "self",
        status: "pending",
      })),
    );
    if (partsError) console.error("[revisions] parts insert failed", revision.id, partsError);
  }

  // --- The booking itself.
  const first = after.lines[0];
  const totalAfter = after.totalPence + extras.totalPence;
  const { error: bookingError } = await admin
    .from("bookings")
    .update({
      repair_node_id: first?.nodeId ?? null,
      repair_description: after.repairDescription,
      combine_source: after.combineSource,
      service_duration_hours: after.serviceDurationHours,
      vehicle_raw_duration_hours: after.rawHours,
      engine_oil_litres: after.oil?.litres ?? null,
      engine_oil_price_per_litre_pence: after.oil?.pencePerLitre ?? null,
      engine_oil_source: after.oil?.source ?? null,
      total_pence: totalAfter,
      base_price_pence: after.basePricePence + extras.labourPence,
      parts_price_pence: after.partsPricePence + extras.partsPence,
      platform_fee_pence: after.platformFeePence + extras.platformFeePence,
      mechanic_payout_pence: after.mechanicPayoutPence + extras.mechanicPayoutPence,
    })
    .eq("id", revision.bookingId);
  if (bookingError) return { ok: false, error: bookingError.message };

  const diff = diffRevision(revision.before, after);
  await admin.from("booking_events").insert({
    booking_id: revision.bookingId,
    event_type: "revision_approved",
    actor_id: actor.id,
    actor_role: actor.role,
    reason: revision.reason,
    payload: {
      revision_id: revision.id,
      total_before: current.total_pence,
      total_after: totalAfter,
      difference_pence: revision.differencePence,
      added: diff.lines.added.map((l) => l.description).concat(diff.parts.added.map((p) => p.name)),
      removed: diff.lines.removed.map((l) => l.description).concat(diff.parts.removed.map((p) => p.name)),
      hold_quote_id: revision.holdQuoteId,
      payment_intent_id: meta.paymentIntentId ?? null,
    },
  });
  void notifyMechanicRevisionOutcome(current as RevisionBookingContact, revision, "approved");
  return { ok: true };
}
