import path from "node:path";

// Deterministic test accounts. Seeded idempotently by seed.setup.ts and logged
// in by auth.setup.ts. Passwords are throwaway test-only values.
export type Role = "customer" | "mechanic" | "admin";

export const TEST_USERS: Record<Role, { email: string; password: string }> = {
  customer: { email: "e2e.customer@bookmytech.test", password: "E2eTestPass!123" },
  mechanic: { email: "e2e.mechanic@bookmytech.test", password: "E2eTestPass!123" },
  admin: { email: "e2e.admin@bookmytech.test", password: "E2eTestPass!123" },
};

const AUTH_DIR = path.resolve(__dirname, "..", ".auth");

/** Saved Playwright storageState file for a role (created by auth.setup.ts). */
export function storageStateFor(role: Role): string {
  return path.join(AUTH_DIR, `${role}.json`);
}
