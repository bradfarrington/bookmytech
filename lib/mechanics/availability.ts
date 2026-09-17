import "server-only";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redispatchPending } from "@/lib/dispatch/dispatch";

// A mechanic flipping their own availability, shared by the website's top-bar
// toggle (app/actions/mechanic-status.ts) and the mechanic app
// (POST /api/mobile/v1/mechanic/status).
//
// `supabase` is a client acting AS the mechanic — cookie-built on the web,
// bearer-built on mobile — so the write runs under RLS ("Mechanics can update
// own status", 0004) and never needs the service role. The payouts and
// suspension gates below are repeated by a trigger (0081), because RLS lets any
// client write `status` straight to the row.
//
// Only 'online' / 'offline' are exposed. 'on_job' is set by staff, not by the
// mechanic.

export type AvailabilityRefusal = "no_payouts" | "on_job" | "suspended";

export type SetAvailabilityResult =
  | { ok: true; status: "online" | "offline" }
  /** The mechanic isn't allowed to do this right now. `error` says why. */
  | { ok: false; refused: AvailabilityRefusal; error: string }
  /** It should have worked and didn't. */
  | { ok: false; refused: null; error: string };

export async function setAvailabilityFor(
  supabase: SupabaseClient,
  userId: string,
  status: "online" | "offline",
): Promise<SetAvailabilityResult> {
  const { data: mechanic } = await supabase
    .from("mechanics")
    .select("status, stripe_payouts_enabled, is_suspended")
    .eq("id", userId)
    .maybeSingle();
  if (!mechanic) return { ok: false, refused: null, error: "Mechanics only." };

  if (mechanic.status === "on_job") {
    return {
      ok: false,
      refused: "on_job",
      error: "You're on a job. Finish it before changing your availability.",
    };
  }

  if (status === "online") {
    // A mechanic can't go online until Stripe payouts are enabled — otherwise
    // we'd dispatch jobs we can't pay them for (Task 08 Stage 3).
    if (!mechanic.stripe_payouts_enabled) {
      return {
        ok: false,
        refused: "no_payouts",
        error: "Connect your bank account before going online.",
      };
    }
    // Dispatch already skips a suspended mechanic; saying so beats letting them
    // sit "online" wondering why nothing arrives.
    if (mechanic.is_suspended) {
      return {
        ok: false,
        refused: "suspended",
        error: "Your account is suspended, so you can't go online. Contact support if you think this is a mistake.",
      };
    }
  }

  const now = new Date().toISOString();
  const patch: Record<string, string> = { status, last_seen_at: now };
  // Stamp online_at only on the offline→online transition so it reflects the
  // start of the current session, not every heartbeat.
  if (status === "online" && mechanic.status !== "online") patch.online_at = now;

  const { error } = await supabase.from("mechanics").update(patch).eq("id", userId);
  if (error) return { ok: false, refused: null, error: error.message };

  // Coming online rescues any job booked while nobody was available — re-offer
  // every still-unassigned booking so it reaches this mechanic if in range.
  if (status === "online") {
    try {
      await redispatchPending();
    } catch (err) {
      console.error("redispatch on go-online failed", err);
    }
  }

  revalidatePath("/mechanic/jobs");
  return { ok: true, status };
}
