import { test, expect } from "@playwright/test";
import { getBooking, getUserId, setTestCredit } from "./helpers/supabase";
import { getPaymentIntent, confirmHold } from "./helpers/stripe";
import { resetOutbox, waitForOutbox } from "./helpers/outbox";
import { TEST_USERS, storageStateFor } from "./helpers/users";
import {
  E2E_REG,
  HAYNESPRO_CONFIGURED,
  funnelToCheckout,
} from "./helpers/funnel";

// === Manual test guide §1.1 — "Make a booking (the core flow)" ===============
//
// Two complementary flows, because the booking has one un-automatable seam:
// Stripe's in-browser confirmPayment is gated by bot-detection (hCaptcha) that
// never resolves under Playwright. So we split §1.1's checks across the two
// payment paths the app actually has:
//
//   1. GUEST CARD PRE-AUTH — drives the funnel, captures the manual-capture
//      PaymentIntent prepareCheckout creates, and confirms it via the Stripe
//      API to verify the "uncaptured hold for the full price" (Stripe test mode).
//   2. CREDIT-COVERED ("free") — a signed-in customer with account credit books
//      with NO Stripe step, so createBookingAction runs in-browser: this is the
//      path that verifies the confirmation screen, the booking row, and the
//      "we're finding your mechanic" email (assert-senders via the test outbox).
//
// Both start at /book/repairs rather than the home page: the /book/vehicle
// step calls the live DVLA/MOT lookup (flaky external dep). Every booking is a
// HaynesPro repair priced from the reg (Task 17), so these tests need BOTH the
// HaynesPro env configured and a real reg that resolves — set E2E_REG to a
// known-good registration (the reg → repair tree → price chain is live).
//
// Without HaynesPro credentials the whole spec skips: there is no bookable
// path that avoids the repair pricing chain any more.

test.skip(
  !HAYNESPRO_CONFIGURED || !E2E_REG,
  "Repairs funnel needs HAYNESPRO_* env + E2E_REG (a reg that resolves live)",
);

test("§1.1 new-customer checkout prepares an uncaptured full-price hold", async ({ page }) => {
  // The clientSecret (→ PaymentIntent id) comes back in the prepareCheckout
  // server-action response when "Confirm booking" is clicked.
  let piId: string | null = null;
  page.on("response", async (r) => {
    try {
      const m = (await r.text()).match(/(pi_[A-Za-z0-9]+)_secret_/);
      if (m) piId = m[1];
    } catch {
      /* binary/streamed response — ignore */
    }
  });

  await funnelToCheckout(page, { email: `e2e-guest-${Date.now()}@bookmytech.test` });
  await page.getByRole("button", { name: /Continue to payment/i }).click();

  // The card step renders with the full price to pre-authorise.
  const payBtn = page.getByRole("button", { name: /Pre-authorise/i });
  await expect(payBtn).toBeVisible();
  const shown = (await payBtn.textContent()) ?? "";
  const penceShown = Math.round(parseFloat(shown.replace(/[^0-9.]/g, "")) * 100);

  await expect.poll(() => piId, { timeout: 15_000 }).not.toBeNull();

  // Before confirmation: a manual-capture intent for the full price.
  const prepared = await getPaymentIntent(piId!);
  expect(prepared.capture_method).toBe("manual");
  expect(prepared.currency).toBe("gbp");
  expect(prepared.amount).toBe(penceShown);

  // Confirm via the Stripe API (the iframe can't be) → a real uncaptured hold.
  const held = await confirmHold(piId!);
  expect(held.status).toBe("requires_capture"); // authorised, NOT captured
  expect(held.amount).toBe(penceShown);
});

test.describe("signed-in, credit-covered", () => {
  test.use({ storageState: storageStateFor("customer") });

  test("§1.1 a fully-credited booking confirms and emails the customer", async ({ page }) => {
    resetOutbox();
    const customerId = await getUserId(TEST_USERS.customer.email);
    await setTestCredit(customerId, 100_000); // £1,000 — covers any repair total
    const email = TEST_USERS.customer.email;

    // Already signed in — the slot screen shows no account block, and the
    // confirm step no longer asks for name/email.
    await funnelToCheckout(page);
    await expect(page.getByText(new RegExp(`Booking as`, "i")).first()).toBeVisible();
    await page.getByRole("button", { name: /Continue to payment/i }).click();

    // Credit covers the total → the no-card "free" confirm step.
    await expect(page.getByText(/covers this booking in full/i)).toBeVisible();
    await page.getByRole("button", { name: /Confirm booking/i }).click();

    // Confirmation screen with a booking reference.
    await expect(page).toHaveURL(/\/book\/confirmed\/[0-9a-f-]+/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Booking confirmed/i })).toBeVisible();

    const bookingId = page.url().split("/book/confirmed/")[1].split(/[?#]/)[0];
    const booking = await getBooking(bookingId);
    expect(booking.payment_mode).toBe("free");
    expect(booking.status).toBe("sourcing_mechanic");
    expect(booking.customer_email).toBe(email);

    // The "we're finding your mechanic" email was dispatched (captured, not sent).
    const sent = await waitForOutbox((e) => e.kind === "email" && e.to === email);
    expect(sent.subject).toMatch(/finding your mechanic/i);
  });
});
