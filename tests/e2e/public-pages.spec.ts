import { test, expect } from "@playwright/test";

// Every page a signed-OUT visitor can reach, at phone and desktop width.
//
// Deliberately needs no session, so it runs without seeding accounts into
// whatever Supabase project .env.local points at. The signed-in dashboard walk
// is the other half of this and needs the seed chain
// (`npx playwright test` runs seed → auth → chromium).
//
// What it is actually guarding:
//   • the homepage reviews section (Task 59), which reads reviews.is_public
//     through a service-role query whose `profiles` embed is ambiguous without
//     the !customer_id hint — a mistake that fails at RUNTIME, not at build,
//     and would show as a silently missing section;
//   • the deep-link carry-through (Task 56): a gated URL must arrive at /login
//     with a `next`, and a hostile `next` must be dropped;
//   • the email-change confirmation screen (Task 58) refusing a bad token.

// Pre-accept cookies for every test here. The consent banner is fixed to the
// bottom of the viewport and intercepts pointer events, so without this a click
// on anything low on the page hits the banner instead — which is a real thing a
// visitor deals with once, and pure noise in a test that runs on every page.
// It is a plain cookie (lib/cookie-consent.ts), deliberately not httpOnly.
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([
    {
      name: "bmt_consent",
      value: "accepted",
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
});

const WIDTHS = [
  { name: "phone", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 900 },
] as const;

const PUBLIC_PAGES = [
  { path: "/", heading: /mobile mechanic|book|car/i },
  { path: "/help", heading: /help/i },
  { path: "/mechanics", heading: /mechanic/i },
  { path: "/terms", heading: /terms/i },
  { path: "/privacy", heading: /privacy/i },
  { path: "/login", heading: /welcome back/i },
  { path: "/signup", heading: /create your account/i },
];

for (const size of WIDTHS) {
  test.describe(`public pages at ${size.name} (${size.width}px)`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    for (const page_ of PUBLIC_PAGES) {
      test(`${page_.path} renders`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));

        const response = await page.goto(page_.path);
        expect(response?.status(), `${page_.path} should not error`).toBeLessThan(400);
        await expect(page.locator("h1").first()).toBeVisible();
        expect(errors, `${page_.path} threw in the browser`).toEqual([]);

        // No horizontal scroll at phone width — the project's standing rule.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${page_.path} scrolls sideways`).toBeLessThanOrEqual(1);
      });
    }
  });
}

test.describe("homepage reviews (Task 59)", () => {
  test("renders real reviews from is_public, or nothing at all", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("#reviews");

    // The section is absent by design when there is nothing public to show, so
    // either state passes — what must NOT happen is an empty shell.
    if ((await section.count()) === 0) {
      test.info().annotations.push({ type: "note", description: "no public reviews to show" });
      return;
    }

    await expect(section).toBeVisible();
    await expect(section.getByText(/what customers say/i)).toBeVisible();

    const cards = section.locator("figure");
    const count = await cards.count();
    expect(count, "the section rendered but has no reviews in it").toBeGreaterThan(0);

    // Every card needs words in it: a bare star rating says nothing on a page,
    // which is the reason for the non-blank-comment filter.
    for (let i = 0; i < count; i += 1) {
      const quote = cards.nth(i).locator("blockquote");
      await expect(quote).toBeVisible();
      expect((await quote.innerText()).trim().length).toBeGreaterThan(0);
    }
  });
});

test.describe("deep links through sign-in (Task 56)", () => {
  test("a gated dashboard URL arrives at /login carrying where it was going", async ({ page }) => {
    await page.goto("/dashboard/inbox");
    await expect(page).toHaveURL(/\/login\?next=/);
    expect(new URL(page.url()).searchParams.get("next")).toBe("/dashboard/inbox");
    // And the form carries it on to the action.
    await expect(page.locator('input[name="next"]')).toHaveValue("/dashboard/inbox");
  });

  test("the destination survives switching to the sign-up door", async ({ page }) => {
    await page.goto("/login?next=%2Fdashboard%2Fgarage");
    await page.getByRole("link", { name: /create an account/i }).click();
    await expect(page).toHaveURL(/\/signup\?next=/);
    await expect(page.locator('input[name="next"]')).toHaveValue("/dashboard/garage");
  });

  test.describe("refuses an off-site destination", () => {
    for (const hostile of ["//evil.com", "https://evil.com", "/dashboard/../admin", "%2f%2fevil.com"]) {
      test(`drops next=${hostile}`, async ({ page }) => {
        await page.goto(`/login?next=${encodeURIComponent(hostile)}`);
        // The page still renders, and the hidden field simply isn't there.
        await expect(page.locator("h1").first()).toBeVisible();
        await expect(page.locator('input[name="next"]')).toHaveCount(0);
      });
    }
  });
});

test.describe("email change confirmation (Task 58)", () => {
  test("refuses a token that means nothing, and offers a way back", async ({ page }) => {
    await page.goto("/account/confirm-email?token=not-a-real-token");
    await expect(page.getByRole("heading", { name: /didn't work/i })).toBeVisible();
    await expect(page.getByText(/expired or has already been used/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /ask for a new link/i })).toBeVisible();
    // Nothing is offered that would imply the change went through.
    await expect(page.getByRole("button", { name: /confirm my new email/i })).toHaveCount(0);
  });

  test("refuses a missing token the same way", async ({ page }) => {
    await page.goto("/account/confirm-email");
    await expect(page.getByRole("heading", { name: /didn't work/i })).toBeVisible();
  });
});
