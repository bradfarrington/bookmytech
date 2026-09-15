import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vehicleLabel } from "@/lib/utils";
import { quoteRepairsResult, type RepairsQuote } from "@/lib/haynespro/repair-booking";
import { parseRepairIds } from "./repair-ids";
import { quoteFollowOn } from "@/lib/quotes/book-follow-on";
import { stepQuery, type BookingBaseParams } from "./step-params";

// The job being booked, loaded once per step of the second half of the funnel
// (Task 47: Time, Address and Confirm). The price is re-quoted on the server at
// every step from (reg, items), or from the follow-on quote, never from the URL.
// A step that can't be served redirects to where the customer can recover.

export interface CheckoutSearchParams {
  reg?: string;
  /** The items being booked; `repair` is the legacy single form. */
  repairs?: string;
  repair?: string;
  make?: string;
  model?: string;
  postcode?: string;
  pref?: string;
  /** A follow-on quote (Task 34). */
  quote?: string;
}

export interface CheckoutContext {
  base: BookingBaseParams;
  quote: RepairsQuote;
  /** "Front brake pads" or "3 jobs". */
  summary: string;
  /** "AB12 CDE · Ford Focus". */
  vehicle: string;
}

/**
 * @param stepPath The step being served, e.g. "/book/time": a signed-out
 *   follow-on visit is sent to log in and brought back to the same step.
 */
export async function loadCheckoutContext(
  params: CheckoutSearchParams,
  stepPath: string,
): Promise<CheckoutContext> {
  const quoteId = params.quote?.trim() || "";

  if (quoteId) {
    // A return visit from a follow-on quote: the price, the vehicle and the
    // mechanic all come from the quote. Signed-in only.
    const session = await createClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    if (!user) redirect(`/login?next=${encodeURIComponent(`${stepPath}?quote=${quoteId}`)}`);
    const followOn = await quoteFollowOn(
      quoteId,
      { userId: user.id, email: user.email ?? null },
      createAdminClient(),
    );
    if (!followOn.ok) redirect(`/dashboard/quotes/${quoteId}`);
    const origin = followOn.origin;
    return withLabels(
      {
        reg: origin.vehicle_reg,
        repairs: [],
        make: origin.vehicle_make ?? undefined,
        model: origin.vehicle_model ?? undefined,
        postcode: params.postcode?.trim() || origin.postcode || undefined,
        pref: origin.mechanic_id ?? undefined,
        quote: quoteId,
      },
      followOn.quote,
    );
  }

  const reg = params.reg ?? "";
  const ids = parseRepairIds(params);
  if (!reg.trim() || ids.length === 0) redirect("/book");
  // Re-quote server-side: the same (reg, items) price identically here, at
  // checkout and at booking create.
  const result = await quoteRepairsResult(reg, ids, createAdminClient());
  if (!result.ok) {
    // A part the job needs can't be priced right now (Task 43): the price step
    // says so. Anything else means the items no longer price for this car.
    if (result.reason === "parts_unavailable") {
      redirect(
        `/book/match?${stepQuery({ reg, repairs: ids, make: params.make, model: params.model, postcode: params.postcode, pref: params.pref })}`,
      );
    }
    redirect(`/book/repairs?reg=${encodeURIComponent(reg)}`);
  }
  const quote = result.quote;
  return withLabels(
    {
      reg,
      repairs: quote.itemIds,
      make: params.make,
      model: params.model,
      postcode: params.postcode?.trim() || undefined,
      pref: params.pref,
    },
    quote,
  );
}

function withLabels(base: BookingBaseParams, quote: RepairsQuote): CheckoutContext {
  return {
    base,
    quote,
    summary: quote.items.length > 1 ? `${quote.items.length} jobs` : quote.description,
    vehicle: vehicleLabel(base.reg, base.make, base.model),
  };
}
