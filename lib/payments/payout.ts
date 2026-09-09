import "server-only";

import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { allocateTransfers, nettedPayout } from "@/lib/earnings";
import { mechanicBalancePence, recordEarning, recordPayout } from "@/lib/mechanics/balance";
import { formatPrice } from "@/lib/utils";

// Pay the mechanic their share of money captured on a booking (Task 37 —
// extracted from completeAndCharge, which now calls it, so the on-site fee
// and the customer-cancellation fee are paid out by the SAME code as a
// completed job).
//
// 1) Record the gross earning — their share regardless of whether cash moves.
// 2) Net it against any debt (a refund BMT fronted on an earlier job):
//    transfer only the surplus, withhold the rest.
// 3) One Stripe transfer per captured charge, each sourced from that charge
//    (`source_transaction`) so the payout releases as the funds settle and
//    can never exceed what that charge captured. With nothing captured (a
//    booking credit covered) one unsourced transfer draws on the platform
//    balance, which funded the credit.
// 4) A failed transfer is NON-fatal — the money is already captured — so it is
//    logged for reconciliation and the earning leaves the balance positive.

export interface CapturedCharge {
  id: string;
  capturedPence: number;
}

export interface PayoutArgs {
  admin: ReturnType<typeof createAdminClient>;
  stripe: Stripe | null;
  bookingId: string;
  mechanicId: string;
  /** The mechanic's gross share of what was charged. */
  grossPence: number;
  /** The charges the money came from; empty when nothing was captured. */
  charges: readonly CapturedCharge[];
  /** Ledger / timeline wording, e.g. "Job 00123 payout" or "Job 00123 on-site diagnostic fee". */
  description: string;
  actorId: string | null;
  actorRole: "mechanic" | "customer" | "system";
}

export async function payoutToMechanic(args: PayoutArgs): Promise<{ transferredPence: number }> {
  const { admin, stripe, bookingId, mechanicId, grossPence, charges, description, actorId, actorRole } = args;
  if (grossPence <= 0) return { transferredPence: 0 };

  const { data: mechanicRow } = await admin.from("mechanics").select("stripe_account_id").eq("id", mechanicId).maybeSingle();
  const account = (mechanicRow as { stripe_account_id: string | null } | null)?.stripe_account_id ?? null;

  const priorBalance = await mechanicBalancePence(admin, mechanicId);
  await recordEarning(admin, mechanicId, bookingId, grossPence, description);
  const { transferPence, recoveredPence } = nettedPayout(priorBalance, grossPence);

  let transferred = 0;
  if (transferPence > 0 && stripe && account) {
    try {
      const plan =
        charges.length > 0
          ? allocateTransfers(charges, transferPence).allocations.map((a) => ({ pence: a.pence, chargeId: a.id as string | null }))
          : [{ pence: transferPence, chargeId: null as string | null }];
      for (const leg of plan) {
        if (leg.pence <= 0) continue;
        const transfer = await stripe.transfers.create({
          amount: leg.pence,
          currency: "gbp",
          destination: account,
          ...(leg.chargeId ? { source_transaction: leg.chargeId } : {}),
          transfer_group: bookingId,
          metadata: { booking_id: bookingId, mechanic_id: mechanicId },
        });
        transferred += leg.pence;
        await recordPayout(admin, mechanicId, bookingId, leg.pence, transfer.id, description);
        await admin.from("booking_events").insert({
          booking_id: bookingId,
          event_type: "payout_transferred",
          actor_id: actorId,
          actor_role: actorRole,
          payload: {
            amount_pence: leg.pence,
            gross_payout_pence: grossPence,
            recovered_pence: recoveredPence,
            transfer_id: transfer.id,
            source_charge: leg.chargeId,
            description,
          },
        });
      }
      if (transferred < transferPence) {
        await admin.from("booking_events").insert({
          booking_id: bookingId,
          event_type: "note",
          actor_role: "system",
          payload: {
            note: `Payout short by ${formatPrice(transferPence - transferred)}: less was captured than the payout needs.`,
            amount_pence: transferPence - transferred,
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "transfer failed";
      console.error("Mechanic payout transfer failed for booking", bookingId, message);
      await admin.from("booking_events").insert({
        booking_id: bookingId,
        event_type: "note",
        actor_id: actorId,
        actor_role: actorRole,
        payload: { note: `Payout transfer failed: ${message}`, amount_pence: transferPence },
      });
    }
  }

  if (recoveredPence > 0 && (transferPence === 0 || (stripe && account))) {
    await admin.from("booking_events").insert({
      booking_id: bookingId,
      event_type: "note",
      actor_role: "system",
      reason: `Withheld ${formatPrice(recoveredPence)} from this payout to recover the mechanic's outstanding balance.`,
      payload: { recovered_pence: recoveredPence, gross_payout_pence: grossPence, transferred_pence: transferPence },
    });
  }
  return { transferredPence: transferred };
}

/** Read the charge id a PaymentIntent produced, whichever shape Stripe returned it in. */
export function chargeIdOf(intent: Stripe.PaymentIntent): string | null {
  return typeof intent.latest_charge === "string" ? intent.latest_charge : (intent.latest_charge?.id ?? null);
}
