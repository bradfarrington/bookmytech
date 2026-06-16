import { type Page, type Frame, expect } from "@playwright/test";

// Stripe test cards (https://stripe.com/docs/testing).
export const TEST_CARDS = {
  success: "4242424242424242",
  requiresAuth: "4000002500003155", // 3DS — needs the extra-auth handshake, not used here
  declined: "4000000000000002",
} as const;

// The PaymentElement renders its fields inside a cross-origin iframe whose URL
// contains "elements-inner-accessory-target". Multiple LPMs (card, klarna, …)
// are active, so it shows an accordion — the card fields only mount once the
// "Card" option is expanded. We drive the Frame object directly (frameLocator
// hits strict-mode because several Stripe iframes share the same title).
function paymentFrame(page: Page): Frame | undefined {
  return page.frames().find((f) => /elements-inner-accessory-target/.test(f.url()));
}

/** Wait until the Stripe PaymentElement iframe has loaded. */
export async function expectStripeFormReady(page: Page) {
  await expect
    .poll(() => Boolean(paymentFrame(page)), {
      timeout: 20_000,
      message: "Stripe PaymentElement iframe did not load",
    })
    .toBe(true);
}

/**
 * Fill the Stripe PaymentElement with a test card. Field accessible names change
 * between Stripe releases — these target the (more stable) placeholders. If this
 * breaks, re-probe with `npx playwright test --headed`.
 */
export async function fillStripeCard(page: Page, card: string = TEST_CARDS.success) {
  await expectStripeFormReady(page);
  const frame = paymentFrame(page)!;

  // Expand the Card accordion if the number field isn't mounted yet.
  const cardNumber = frame.getByPlaceholder("1234 1234 1234 1234");
  if ((await cardNumber.count()) === 0) {
    await frame.getByRole("button", { name: "Card", exact: true }).click();
  }
  await cardNumber.fill(card);
  await frame.getByPlaceholder("MM / YY").fill("12 / 34");
  await frame.getByPlaceholder("CVC").fill("123");

  // This PaymentElement also collects contact details inline — fill any that
  // appear so confirmPayment isn't blocked on a required field.
  const optional: Array<[string, string]> = [
    ["First and last name", "E2E Guest"],
    ["you@example.com", "e2e-card@bookmytech.test"],
    ["07400 123456", "07400123456"],
  ];
  for (const [ph, val] of optional) {
    const field = frame.getByPlaceholder(ph, { exact: true });
    if (await field.count()) await field.fill(val).catch(() => {});
  }
}
