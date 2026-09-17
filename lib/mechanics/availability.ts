import "server-only";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redispatchPending } from "@/lib/dispatch/dispatch";
import { nextShiftStart, type ResumeRequest, type ShiftRow } from "@/lib/mechanics/today";
import { createAdminClient } from "@/lib/supabase/admin";

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
//
// TIMED OFFLINE (Task 66). Going offline may carry a `resume` — "come back
// online in 30 min / in 1 hour / at my next shift" — which becomes
// `mechanics.resume_online_at`; /api/cron/resume-online then calls this same
// function to bring them back. That column is the one write here that is NOT
// made as the mechanic: their session may not set it (0083), so it goes through
// the service role once the rest has been allowed. Offline with no `resume`
// clears it, and a trigger clears it on every route to 'online' or 'on_job'.

export type AvailabilityRefusal = "no_payouts" | "on_job" | "suspended" | "no_hours";

export type SetAvailabilityResult =
  | { ok: true; status: "online" | "offline"; resumeAt: string | null }
  /** The mechanic isn't allowed to do this right now. `error` says why. */
  | { ok: false; refused: AvailabilityRefusal; error: string }
  /** It should have worked and didn't. */
  | { ok: false; refused: null; error: string };

export async function setAvailabilityFor(
  supabase: SupabaseClient,
  userId: string,
  status: "online" | "offline",
  options: {
    /** Offline only: when to come back by themselves. Ignored when going online. */
    resume?: ResumeRequest;
    /** The cron brings several mechanics online and re-offers once, afterwards. */
    skipRedispatch?: boolean;
  } = {},
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

  // Worked out before anything is written, so a refusal changes nothing.
  let resumeAt: string | null = null;
  if (status === "offline" && options.resume) {
    if ("minutes" in options.resume) {
      resumeAt = new Date(Date.now() + options.resume.minutes * 60_000).toISOString();
    } else {
      const { data: hours } = await supabase
        .from("mechanic_availability")
        .select("day_of_week, is_active, start_time")
        .eq("mechanic_id", userId);
      const start = nextShiftStart((hours ?? []) as ShiftRow[]);
      if (!start) return { ok: false, refused: "no_hours", error: "Set your working hours first." };
      resumeAt = start.toISOString();
    }
  }

  const now = new Date().toISOString();
  const patch: Record<string, string> = { status, last_seen_at: now };
  // Stamp online_at only on the offline→online transition so it reflects the
  // start of the current session, not every heartbeat.
  if (status === "online" && mechanic.status !== "online") patch.online_at = now;

  const { error } = await supabase.from("mechanics").update(patch).eq("id", userId);
  if (error) return { ok: false, refused: null, error: error.message };

  if (status === "offline") {
    const { error: resumeError } = await createAdminClient()
      .from("mechanics")
      .update({ resume_online_at: resumeAt })
      .eq("id", userId)
      .eq("status", "offline");
    if (resumeError) {
      // Asked for and not set: say so rather than promise a return that won't
      // happen. Not asked for: they are offline, which is all they wanted —
      // and before 0083 is applied this is every plain "go offline".
      if (resumeAt) return { ok: false, refused: null, error: resumeError.message };
      console.error("clearing resume_online_at failed", resumeError);
    }
  }

  // Coming online rescues any job booked while nobody was available — re-offer
  // every still-unassigned booking so it reaches this mechanic if in range.
  if (status === "online" && !options.skipRedispatch) {
    try {
      await redispatchPending();
    } catch (err) {
      console.error("redispatch on go-online failed", err);
    }
  }

  revalidatePath("/mechanic/jobs");
  return { ok: true, status, resumeAt };
}
