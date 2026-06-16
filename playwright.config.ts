import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Load the same env the app uses (Supabase service-role, Stripe test keys, …).
// Playwright's own process needs these for seeding + Stripe assertions; the dev
// server it spawns reads .env.local itself via Next.
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

// Where the test-only sender hook (lib/test-outbox.ts) writes captured emails/SMS.
// Set here so BOTH this process (the outbox reader) and the spawned dev server
// (the writer) agree on one absolute path.
const OUTBOX_DIR = path.resolve(__dirname, "tests/e2e/.outbox");
process.env.TEST_OUTBOX_DIR = OUTBOX_DIR;

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  // Booking flows hit Stripe + Supabase; give them room and don't hammer in parallel.
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    // Ordered setup chain (each runs once the dev server is up):
    //   seed → create test users, then auth → log each role in + save session.
    // chromium depends on auth (and transitively seed), so specs always run last.
    { name: "seed", testMatch: /seed\.setup\.ts/ },
    { name: "auth", testMatch: /auth\.setup\.ts/, dependencies: ["seed"] },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["auth"],
      testIgnore: /.*\.setup\.ts/,
    },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Inherit the loaded env and turn on the test-only outbox so no real
    // emails/SMS are sent during the run.
    env: { ...process.env, TEST_OUTBOX_DIR: OUTBOX_DIR },
  },
});
