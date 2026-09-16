import { describe, expect, it } from "vitest";
import { validateCustomerInput } from "./provision";

// Guards the bug the "Already have an account? Sign in" link would otherwise
// have walked straight into (2026-09-16).
//
// validateCustomerInput is the NEW-SIGNUP rule set. It is correct as it stands;
// what was wrong was running it on someone signing in to an account that
// already exists. These pin the two refusals that made the sign-in path
// impossible, so it is obvious why ensureCustomerAccount must skip it when the
// intent is "signin".
describe("validateCustomerInput is a signup rule, not a sign-in rule", () => {
  const good = { email: "alex@example.com", password: "longenough1", fullName: "Alex Smith" };

  it("accepts a complete new signup", () => {
    expect(validateCustomerInput(good)).toBeNull();
  });

  it("refuses a missing name — nonsense when signing in", () => {
    expect(validateCustomerInput({ ...good, fullName: "" })).toBe("Enter your name.");
  });

  it("refuses a short password — an existing account may predate the rule", () => {
    expect(validateCustomerInput({ ...good, password: "short" })).toMatch(/at least/);
  });

  it("refuses a malformed email in either case", () => {
    expect(validateCustomerInput({ ...good, email: "nope" })).toBe("Enter a valid email address.");
  });
});
