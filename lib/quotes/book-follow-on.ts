import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ownsBooking } from "@/lib/bookings/ownership";
import type { RepairsQuote } from "@/lib/haynespro/repair-booking";
import { buildFollowOnQuote, followOnRefusal } from "./follow-on";
import { loadQuote, type QuoteView } from "./load";

// The server half of booking a follow-on quote (Task 34): find it, prove the
// caller owns the job it came from, and price it. Signed-in only — a
// follow-on is raised on a job the customer already has, and the new booking
// must belong to the same account.

export interface FollowOnOrigin {
  id: string;
  vehicle_reg: string;
  vehicle_make: string | null;
  vehicle_model: string | null;
  postcode: string | null;
  mechanic_id: string | null;
}

export type FollowOnResult =
  | { ok: true; quote: RepairsQuote; source: QuoteView; origin: FollowOnOrigin }
  | { ok: false; error: string };

export async function quoteFollowOn(
  quoteId: string,
  caller: { userId: string; email: string | null },
  db: SupabaseClient,
): Promise<FollowOnResult> {
  const source = await loadQuote(db, quoteId);
  if (!source) return { ok: false, error: "That quote no longer exists." };
  const refusal = followOnRefusal(source);
  if (refusal) return { ok: false, error: refusal };

  const { data: origin } = await db
    .from("bookings")
    .select("id, customer_id, customer_email, vehicle_reg, vehicle_make, vehicle_model, postcode, mechanic_id")
    .eq("id", source.bookingId)
    .maybeSingle();
  if (!origin) return { ok: false, error: "The job this quote came from no longer exists." };
  if (!ownsBooking(origin, caller)) return { ok: false, error: "This isn't your quote." };

  const quote = buildFollowOnQuote(source);
  if (!quote) return { ok: false, error: "This quote can't be booked. Ask your mechanic to send it again." };
  return { ok: true, quote, source, origin };
}
