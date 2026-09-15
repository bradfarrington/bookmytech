import { describe, expect, it } from "vitest";

import { cardBrandLabel, cardExpiry, isCardExpired, setupReturnStatus } from "./cards";

describe("cardBrandLabel", () => {
  it("names Stripe's card brands", () => {
    expect(cardBrandLabel("visa")).toBe("Visa");
    expect(cardBrandLabel("mastercard")).toBe("Mastercard");
    expect(cardBrandLabel("amex")).toBe("American Express");
    expect(cardBrandLabel("American Express")).toBe("American Express");
    expect(cardBrandLabel("discover")).toBe("Discover");
    expect(cardBrandLabel("diners")).toBe("Diners Club");
    expect(cardBrandLabel("jcb")).toBe("JCB");
    expect(cardBrandLabel("unionpay")).toBe("UnionPay");
  });

  it("calls anything else a card", () => {
    expect(cardBrandLabel("unknown")).toBe("Card");
    expect(cardBrandLabel("eftpos_au")).toBe("Card");
    expect(cardBrandLabel("")).toBe("Card");
    expect(cardBrandLabel(null)).toBe("Card");
  });
});

describe("cardExpiry", () => {
  it("shows MM/YY", () => {
    expect(cardExpiry(12, 2028)).toBe("12/28");
    expect(cardExpiry(4, 2030)).toBe("04/30");
    expect(cardExpiry(1, 2100)).toBe("01/00");
  });

  it("shows nothing for a nonsense date", () => {
    expect(cardExpiry(13, 2028)).toBe("");
    expect(cardExpiry(0, 2028)).toBe("");
  });
});

describe("isCardExpired", () => {
  const now = new Date("2026-09-15T09:00:00.000Z");

  it("keeps a card good to the end of its expiry month", () => {
    expect(isCardExpired(9, 2026, now)).toBe(false);
    expect(isCardExpired(8, 2026, now)).toBe(true);
    expect(isCardExpired(12, 2025, now)).toBe(true);
    expect(isCardExpired(1, 2027, now)).toBe(false);
  });
});

describe("setupReturnStatus", () => {
  it("reads Stripe's return parameters", () => {
    expect(setupReturnStatus({})).toBeNull();
    expect(setupReturnStatus({ redirect_status: "succeeded" })).toBeNull();
    expect(setupReturnStatus({ setup_intent: "seti_1", redirect_status: "succeeded" })).toBe("succeeded");
    expect(setupReturnStatus({ setup_intent: "seti_1", redirect_status: "processing" })).toBe("processing");
    expect(setupReturnStatus({ setup_intent: "seti_1", redirect_status: "failed" })).toBe("failed");
    expect(setupReturnStatus({ setup_intent: ["seti_1"], redirect_status: ["requires_payment_method"] })).toBe("failed");
  });
});
