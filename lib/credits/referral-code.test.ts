import { describe, it, expect } from "vitest";
import { referralCodeFromBytes, normaliseReferralCode } from "./referral-code";

describe("referralCodeFromBytes", () => {
  it("prefixes BMT and uses the unambiguous alphabet", () => {
    const code = referralCodeFromBytes(new Uint8Array([0, 1, 2, 3, 4, 5]));
    expect(code.startsWith("BMT")).toBe(true);
    expect(code).toBe("BMTABCDEF");
    // No look-alike characters anywhere.
    expect(/[01OIL]/.test(code.slice(3))).toBe(false);
  });

  it("is deterministic for the same bytes and honours length", () => {
    const bytes = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
    expect(referralCodeFromBytes(bytes, 8)).toBe(referralCodeFromBytes(bytes, 8));
    expect(referralCodeFromBytes(bytes, 8).length).toBe(3 + 8);
  });
});

describe("normaliseReferralCode", () => {
  it("uppercases and strips whitespace", () => {
    expect(normaliseReferralCode("  bmt abc ")).toBe("BMTABC");
  });
});
