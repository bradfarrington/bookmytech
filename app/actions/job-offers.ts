"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type OfferActionResult =
  | { ok: true; bookingId?: string }
  | { ok: false; error: string };

// All offer mutations verify the caller is the owning mechanic (RLS-aware
// client), then perform privileged writes via the service-role client:
//   - accept assigns the booking + supersedes every sibling offer, and must be
//     atomic across rows — not expressible as a row policy.
//   - decline / supersede touch the offer row only.
async function requireMechanic() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "mechanic")
    return { ok: false as const, error: "Mechanics only." };
  return { ok: true as const, mechanicId: user.id };
}

export async function acceptOffer(offerId: string): Promise<OfferActionResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;

  const admin = createAdminClient();

  const { data: offer } = await admin
    .from("job_offers")
    .select("id, booking_id, mechanic_id, response")
    .eq("id", offerId)
    .single();

  if (!offer) return { ok: false, error: "That offer no longer exists." };
  if (offer.mechanic_id !== guard.mechanicId)
    return { ok: false, error: "This isn't your offer." };
  if (offer.response)
    return { ok: false, error: "You've already responded to this offer." };

  const now = new Date().toISOString();

  // Atomic first-to-accept: only succeeds if the booking is still unassigned
  // and sourcing. If another mechanic won the race, 0 rows update.
  const { data: claimed, error: claimErr } = await admin
    .from("bookings")
    .update({ mechanic_id: guard.mechanicId, status: "confirmed" })
    .eq("id", offer.booking_id)
    .eq("status", "sourcing_mechanic")
    .is("mechanic_id", null)
    .select("id")
    .maybeSingle();

  if (claimErr) return { ok: false, error: claimErr.message };

  if (!claimed) {
    // Lost the race — mark our offer superseded so it drops off our feed.
    await admin
      .from("job_offers")
      .update({ response: "superseded", responded_at: now })
      .eq("id", offerId)
      .is("response", null);
    revalidatePath("/mechanic/jobs");
    return { ok: false, error: "Another mechanic just accepted this job." };
  }

  // Mark our offer accepted.
  await admin
    .from("job_offers")
    .update({ response: "accepted", responded_at: now })
    .eq("id", offerId);

  // Supersede every other still-live offer for this booking.
  await admin
    .from("job_offers")
    .update({ response: "superseded", responded_at: now })
    .eq("booking_id", offer.booking_id)
    .neq("id", offerId)
    .is("response", null);

  // Append-only audit.
  await admin.from("booking_events").insert({
    booking_id: offer.booking_id,
    event_type: "mechanic_assigned",
    actor_id: guard.mechanicId,
    actor_role: "mechanic",
    payload: {
      mechanic_id: guard.mechanicId,
      via: "offer_accept",
      status_from: "sourcing_mechanic",
      status_to: "confirmed",
    },
  });

  revalidatePath("/mechanic/jobs");
  return { ok: true, bookingId: offer.booking_id };
}

export async function declineOffer(offerId: string): Promise<OfferActionResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;

  const admin = createAdminClient();

  const { data: offer } = await admin
    .from("job_offers")
    .select("id, mechanic_id, response")
    .eq("id", offerId)
    .single();

  if (!offer) return { ok: false, error: "That offer no longer exists." };
  if (offer.mechanic_id !== guard.mechanicId)
    return { ok: false, error: "This isn't your offer." };
  if (offer.response)
    return { ok: false, error: "You've already responded to this offer." };

  // Decline only removes it from THIS mechanic's feed — every other eligible
  // mechanic still holds their live offer (broadcast model).
  await admin
    .from("job_offers")
    .update({ response: "declined", responded_at: new Date().toISOString() })
    .eq("id", offerId)
    .is("response", null);

  revalidatePath("/mechanic/jobs");
  return { ok: true };
}
