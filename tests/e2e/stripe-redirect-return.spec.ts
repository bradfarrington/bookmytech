import { test, expect, type Page } from "@playwright/test";
import { getBookingByIntent } from "./helpers/supabase";
import { confirmHold, getPaymentIntent } from "./helpers/stripe";
import {
  E2E_REG,
  HAYNESPRO_CONFIGURED,
  TEST_ADDRESS,
  funnelToCheckout,
} from "./helpers/funnel";

// === The 3-D Secure redirect return path ====================================
//
// When the issuer won't run its challenge inside Stripe's iframe, Stripe
// navigates the whole page away and later returns the customer to `return_url`
// — to a freshly mounted SlotPicker with none of their answers and a live hold
// on their card. slot-picker.tsx parks the draft in sessionStorage before
// confirming and replays it on the way back. These tests cover that replay.
//
// WHAT IS AND ISN'T REAL HERE. Stripe's in-browser confirmPayment is gated by
// bot-detection (hCaptcha) that never resolves under Playwright, so the actual
// challenge-and-redirect can't be driven from a test — see customer-booking.spec.
// Everything either side of it is real and is what these tests exercise:
//
//   • the draft is written by the APP, not the test: clicking "Pre-authorise"
//     runs saveDraft() synchronously before confirmPayment is ever called, so
//     the draft lands in sessionStorage even though the confirm then hangs;
//   • the PaymentIntent is a real one from prepareCheckout, confirmed for real
//     through the Stripe API into a real uncaptured hold;
//   • the return URL is the one the app builds, with the params Stripe appends;
//   • sessionStorage survives the same-tab navigation, exactly as it would
//     after a real redirect.
//
// The one thing simulated is the browser trip to the bank and back. A live
// 3-D Secure card (4000 0027 6000 3184) still needs one manual pass by hand.

test.skip(
  !HAYNESPRO_CONFIGURED || !E2E_REG,
  "Repairs funnel needs HAYNESPRO_* env + E2E_REG (a reg that resolves live)",
);

/** Full client secret, sniffed off the prepareCheckout server-action response. */
function watchForClientSecret(page: Page): () => string | null {
  let secret: string | null = null;
  page.on("response", async (r) => {
    try {
      const m = (await r.text()).match(/pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+/);
      if (m && !secret) secret = m[0];
    } catch {
      /* binary/streamed response — ignore */
    }
  });
  return () => secret;
}

/**
 * Funnel to the card step, click "Pre-authorise", and wait for the draft the
 * app parks before confirming. Returns the intent's client secret and the slot
 * URL the return URL is built from.
 */
async function prepareAndPark(page: Page): Promise<{ secret: string; slotUrl: URL }> {
  const readSecret = watchForClientSecret(page);
  await funnelToCheckout(page, { email: `e2e-3ds-${Date.now()}@bookmytech.test` });
  const slotUrl = new URL(page.url());

  await page.getByRole("button", { name: /Continue to payment/i }).click();
  const payBtn = page.getByRole("button", { name: /Pre-authorise/i });
  await expect(payBtn).toBeVisible();
  await expect.poll(readSecret, { timeout: 15_000 }).not.toBeNull();
  const secret = readSecret()!;

  // Submitting parks the draft, THEN calls confirmPayment (which hangs under
  // automation). We only need the first half to have happened.
  await payBtn.click();
  const key = `bmt.checkout-draft.${secret.split("_secret_")[0]}`;
  await expect
    .poll(() => page.evaluate((k) => sessionStorage.getItem(k), key), { timeout: 20_000 })
    .not.toBeNull();

  return { secret, slotUrl };
}

/** The URL Stripe sends the customer back to, with the params it appends. */
function returnUrl(slotUrl: URL, secret: string, status: string): string {
  const params = new URLSearchParams({
    reg: slotUrl.searchParams.get("reg") ?? "",
    repair: slotUrl.searchParams.get("repair") ?? "",
    payment_intent: secret.split("_secret_")[0],
    payment_intent_client_secret: secret,
    redirect_status: status,
  });
  return `/book/slot?${params}`;
}

test("a hold placed during a redirect is turned into a booking on the way back", async ({
  page,
}) => {
  const { secret, slotUrl } = await prepareAndPark(page);
  const piId = secret.split("_secret_")[0];

  // The challenge succeeds: a real, uncaptured hold. NOT `succeeded` — a
  // confirmed manual-capture intent sits at requires_capture, which is the
  // status the return path has to recognise.
  const held = await confirmHold(piId);
  expect(held.status).toBe("requires_capture");

  // Same tab, so the parked draft is still in sessionStorage — as after a real
  // redirect. The picker should complete the booking without asking anything.
  // (Not asserting the "Confirming your booking…" card — it's a real race with
  // the redirect it precedes. Landing on the confirmation page is the invariant.)
  await page.goto(returnUrl(slotUrl, secret, "succeeded"));
  await expect(page).toHaveURL(/\/book\/confirmed\/[0-9a-f-]+/, { timeout: 30_000 });

  // The same row the non-redirect path would have written.
  const booking = await getBookingByIntent(piId);
  expect(booking).not.toBeNull();
  expect(booking!.payment_mode).toBe("preauth");
  expect(booking!.status).toBe("sourcing_mechanic");
  expect(booking!.address_line_1).toBe(TEST_ADDRESS);
  expect(booking!.slot_window).toMatch(/8am|Morning|–/i);
  expect(booking!.scheduled_at).not.toBeNull();
  expect(page.url()).toContain(`/book/confirmed/${booking!.id}`);

  // Still only a hold — nothing captured at booking time.
  expect((await getPaymentIntent(piId)).status).toBe("requires_capture");

  // And the draft is cleared, so a reload can't write a second row.
  const leftover = await page.evaluate(
    (k) => sessionStorage.getItem(k),
    `bmt.checkout-draft.${piId}`,
  );
  expect(leftover).toBeNull();
});

test("a failed challenge writes no booking and puts the customer back on the form", async ({
  page,
}) => {
  const { secret, slotUrl } = await prepareAndPark(page);
  const piId = secret.split("_secret_")[0];

  // Never confirmed — the customer failed the challenge, so the intent is still
  // requires_payment_method and nothing is held.
  expect((await getPaymentIntent(piId)).status).toBe("requires_payment_method");

  await page.goto(returnUrl(slotUrl, secret, "failed"));

  // Their answers come back rather than being silently reset to step one.
  await expect(page.getByPlaceholder("House number and street")).toHaveValue(TEST_ADDRESS, {
    timeout: 20_000,
  });
  await expect(page.getByText(/didn't authorise that payment/i)).toBeVisible();

  // No booking row, and nothing taken.
  expect(await getBookingByIntent(piId)).toBeNull();
  expect((await getPaymentIntent(piId)).status).toBe("requires_payment_method");
});
