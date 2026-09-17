import "server-only";
import { revalidatePath } from "next/cache";
import { jobMoney } from "@/lib/mechanics/job-money";
import { refuse, type MechanicRefusal } from "@/lib/mechanics/refusal";
import { createAdminClient } from "@/lib/supabase/admin";

// The mechanic's two writes on a job's parts: where a part has got to
// (`markPartStatusFor`, Task 68), and who sources it — the mechanic ('self') or
// Book My Tech ('bmt'). Shared by the website's actions
// (app/actions/booking-parts.ts) and the mechanic app's
// POST …/mechanic/booking-parts/[partId]/{status,sourcing} (Tasks 67, 68).
// The money model is described in that action file; the short version is that
// sourcing moves the PARTS money and nothing else.

export type PartSourcing = "self" | "bmt";

export type PartSourcingResult =
  | {
      ok: true;
      bookingId: string;
      /** The mechanic's take-home afterwards, as the job screen shows it. */
      payoutPence: number;
    }
  | MechanicRefusal;

type Admin = ReturnType<typeof createAdminClient>;

/** The part, if it is on a job assigned to this mechanic. */
async function assignedPart(
  admin: Admin,
  mechanicId: string,
  bookingPartId: string,
): Promise<{ ok: true; bookingId: string } | MechanicRefusal> {
  const { data: line } = await admin
    .from("booking_parts")
    .select("id, booking_id, booking:bookings(mechanic_id)")
    .eq("id", bookingPartId)
    .maybeSingle();
  if (!line) return refuse("not_found", "Part not found.");
  const owner = Array.isArray(line.booking) ? line.booking[0] : line.booking;
  if (!owner || owner.mechanic_id !== mechanicId) return refuse("forbidden", "You're not assigned to this job.");
  return { ok: true, bookingId: line.booking_id as string };
}

export type PartStatus = "ordered" | "delivered" | "used";
export type PartStatusResult = { ok: true; bookingId: string } | MechanicRefusal;

/**
 * Move a part along: ordered → delivered → used. Shared by the website's
 * `markPartStatus` and the mechanic app's
 * POST …/mechanic/booking-parts/[partId]/status (Task 68). Any of the three can
 * be set from any other, as on the website — it is a note of where the part
 * is, not a gate on anything.
 */
export async function markPartStatusFor(
  mechanicId: string,
  bookingPartId: string,
  status: unknown,
): Promise<PartStatusResult> {
  if (status !== "ordered" && status !== "delivered" && status !== "used")
    return refuse("invalid", "Invalid part status.");

  const admin = createAdminClient();
  const part = await assignedPart(admin, mechanicId, bookingPartId);
  if (!part.ok) return part;

  const patch: Record<string, unknown> = { status };
  if (status === "ordered") patch.ordered_at = new Date().toISOString();
  if (status === "delivered") patch.delivered_at = new Date().toISOString();

  const { error } = await admin.from("booking_parts").update(patch).eq("id", bookingPartId);
  if (error) return refuse("failed", error.message);

  revalidatePath(`/mechanic/jobs/${part.bookingId}`);
  return { ok: true, bookingId: part.bookingId };
}

export async function setPartSourcingFor(
  mechanicId: string,
  bookingPartId: string,
  sourcing: unknown,
): Promise<PartSourcingResult> {
  if (sourcing !== "self" && sourcing !== "bmt") return refuse("invalid", "Invalid sourcing option.");

  const admin = createAdminClient();
  const part = await assignedPart(admin, mechanicId, bookingPartId);
  if (!part.ok) return part;
  const { bookingId } = part;

  // Ordering via BMT moves the line into the ordering workflow; self-sourcing
  // resets it to pending (the mechanic handles it themselves).
  const { error } = await admin
    .from("booking_parts")
    .update({
      sourcing,
      status: sourcing === "bmt" ? "ordered" : "pending",
      ordered_at: sourcing === "bmt" ? new Date().toISOString() : null,
    })
    .eq("id", bookingPartId);
  if (error) return refuse("failed", error.message);

  const payoutPence = await recomputePayout(admin, bookingId);
  revalidatePath(`/mechanic/jobs/${bookingId}`);
  return { ok: true, bookingId, payoutPence };
}

/**
 * Recompute and persist the booking's snapshotted payout from its parts
 * sourcing (`mechanic_payout_pence = total − fee − Σ bmt`), and hand back the
 * figure the job screen shows.
 */
async function recomputePayout(admin: Admin, bookingId: string): Promise<number> {
  const [{ data: booking }, { data: parts }] = await Promise.all([
    admin
      .from("bookings")
      .select("total_pence, platform_fee_pence, commission_rate")
      .eq("id", bookingId)
      .single(),
    admin.from("booking_parts").select("total_pence, sourcing").eq("booking_id", bookingId),
  ]);
  if (!booking) return 0;

  const money = jobMoney(booking, parts ?? []);
  const payout = Math.max(0, money.customerPaysPence - (booking.platform_fee_pence ?? 0) - money.bmtPartsPence);
  await admin.from("bookings").update({ mechanic_payout_pence: payout }).eq("id", bookingId);
  return money.payoutPence;
}
