import { test as setup, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { TEST_USERS, storageStateFor, type Role } from "../helpers/users";

// Logs each role in through the real login form and saves the session to a
// storageState file. Spec files reuse these with:
//   test.use({ storageState: storageStateFor("customer") })
// so they don't re-login per test. Depends on seed.setup.ts having run.

// Landing patterns must NOT also match the corresponding /login URL, or a failed
// login reads as success (e.g. "/mechanic/login" matches "/mechanic/").
const LOGIN: Record<Role, { url: string; landing: RegExp }> = {
  customer: { url: "/login", landing: /\/dashboard/ },
  mechanic: { url: "/mechanic/login", landing: /\/mechanic\/jobs/ },
  admin: { url: "/admin/login", landing: /\/admin\/?$/ },
};

for (const role of Object.keys(TEST_USERS) as Role[]) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    const { email, password } = TEST_USERS[role];
    const { url, landing } = LOGIN[role];

    await page.goto(url);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Land off the login page (the role guard redirects on success).
    await expect(page).toHaveURL(landing, { timeout: 20_000 });

    const file = storageStateFor(role);
    mkdirSync(path.dirname(file), { recursive: true });
    await page.context().storageState({ path: file });
  });
}
