import { describe, expect, it } from "vitest";
import { mobileStripeReturnUrl, validAppReturnUrl } from "./mobile-return";

describe("validAppReturnUrl", () => {
  it("accepts the app's own schemes", () => {
    expect(validAppReturnUrl("bmtmechanic://payouts")).toBe("bmtmechanic://payouts");
    expect(validAppReturnUrl("exp+bmt-mechanic-app://payouts")).toBe(
      "exp+bmt-mechanic-app://payouts",
    );
  });

  it("refuses anything that would make the bounce page an open redirect", () => {
    for (const bad of [
      "https://evil.example",
      "http://evil.example/bmtmechanic://payouts",
      "//evil.example",
      "javascript:alert(1)",
      "bmtmechanic-evil://payouts",
      "exp://192.168.0.2:8081/--/payouts",
      "/mechanic/jobs",
      "",
      null,
      undefined,
      42,
      `bmtmechanic://${"a".repeat(600)}`,
    ]) {
      expect(validAppReturnUrl(bad)).toBeNull();
    }
  });

  it("survives the round trip through the bounce URL", () => {
    const bounce = new URL(mobileStripeReturnUrl("bmtmechanic://payouts?from=stripe"));
    expect(bounce.pathname).toBe("/mobile-return/mechanic-stripe");
    expect(validAppReturnUrl(bounce.searchParams.get("to"))).toBe(
      "bmtmechanic://payouts?from=stripe",
    );
  });
});
