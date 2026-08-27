import { expect, type Page } from "@playwright/test";

// The shared "walk the customer funnel to the payment step" driver, used by
// every spec that needs a real priced checkout. Lives here rather than in one
// spec so the two Stripe specs can't drift apart in how they get there.

export const GUEST_PASSWORD = "E2eTestPass!123";

export const E2E_REG = process.env.E2E_REG ?? "";

export const HAYNESPRO_CONFIGURED = Boolean(
  process.env.HAYNESPRO_DISTRIBUTOR_USERNAME &&
    process.env.HAYNESPRO_DISTRIBUTOR_PASSWORD,
);

/** Start at /book/repairs, not the home page: /book/vehicle hits live DVLA. */
export const START_URL = `/book/repairs?reg=${encodeURIComponent(E2E_REG)}&postcode=SW1A1AA`;

/** The address the funnel helper types — assert against it when checking a row. */
export const TEST_ADDRESS = "12 Test Street";

/**
 * Drive the funnel: drill the repair tree to the first bookable repair →
 * review price → pick today's morning slot → fill the address.
 *
 * `newAccount` fills the account block a guest now sees on the slot screen —
 * every booking creates (or signs into) an account BEFORE the pre-auth, so the
 * customer lands on a dashboard that owns the job. Signed-in runs pass nothing.
 */
export async function funnelToCheckout(page: Page, newAccount?: { email: string }) {
  await page.goto(START_URL);
  // Drill down group links until a priced "book" link (→ /book/match) appears.
  for (let depth = 0; depth < 8; depth++) {
    const bookLink = page.locator('a[href*="/book/match"]').first();
    if ((await bookLink.count()) > 0) break;
    await page.locator('a[href*="/book/repairs"][href*="node="]').first().click();
  }
  await page.locator('a[href*="/book/match"]').first().click();
  await expect(page).toHaveURL(/\/book\/match/);
  await page.getByRole("button", { name: /Pick a time/i }).click();
  await expect(page).toHaveURL(/\/book\/slot/);
  // Windows that have already closed today render disabled, so take the first
  // one that's still open — it may be on a later day chip if it's late in the
  // day, but the picker pre-selects the first day with an open window.
  await page
    .getByRole("button", { name: /^(8am|10am|12pm|2pm|4pm|6pm)–/ })
    .and(page.locator(":enabled"))
    .first()
    .click();
  await page.getByPlaceholder("House number and street").fill(TEST_ADDRESS);

  if (newAccount) {
    await page.getByPlaceholder("Full name").fill("E2E Guest Customer");
    await page.getByPlaceholder("Email address").fill(newAccount.email);
    await page.getByPlaceholder(/Create a password/i).fill(GUEST_PASSWORD);
  }
}
