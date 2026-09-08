import { describe, expect, it } from "vitest";
import {
  chargeAfterDiscounts,
  normalisePromoCode,
  promoOfferLabel,
  validatePromoCode,
  type PromoCodeRow,
  type PromoContext,
} from "./validate";

const code: PromoCodeRow = {
  id: "c1",
  code: "WELCOME10",
  kind: "percent",
  value: 10,
  description: null,
  starts_at: "2026-09-01T00:00:00Z",
  expires_at: "2026-12-01T00:00:00Z",
  max_redemptions: 2,
  per_customer_limit: 1,
  min_total_pence: 0,
  is_active: true,
};

const ctx: PromoContext = {
  now: new Date("2026-09-08T12:00:00Z"),
  customerId: "u1",
  totalPence: 12000,
  liveRedemptions: 0,
  customerRedemptions: 0,
};

describe("validatePromoCode", () => {
  it("takes a percentage of the total, rounded to the penny", () => {
    expect(validatePromoCode(code, ctx)).toEqual({ ok: true, discountPence: 1200 });
    expect(validatePromoCode({ ...code, value: 15 }, { ...ctx, totalPence: 5999 })).toEqual({
      ok: true,
      discountPence: 900,
    });
  });

  it("takes a fixed amount, never more than the total", () => {
    expect(validatePromoCode({ ...code, kind: "fixed", value: 1000 }, ctx)).toEqual({ ok: true, discountPence: 1000 });
    expect(validatePromoCode({ ...code, kind: "fixed", value: 20000 }, ctx)).toEqual({ ok: true, discountPence: 12000 });
  });

  it("refuses with a sentence the customer can act on", () => {
    expect(validatePromoCode(null, ctx)).toEqual({ ok: false, error: "That code isn't valid." });
    expect(validatePromoCode({ ...code, is_active: false }, ctx)).toEqual({ ok: false, error: "That code isn't valid." });
    expect(validatePromoCode(code, { ...ctx, customerId: null })).toEqual({
      ok: false,
      error: "Sign in to use a discount code.",
    });
    expect(validatePromoCode({ ...code, starts_at: "2026-10-01T00:00:00Z" }, ctx)).toEqual({
      ok: false,
      error: "That code isn't active yet.",
    });
    expect(validatePromoCode({ ...code, expires_at: "2026-09-01T00:00:00Z" }, ctx)).toEqual({
      ok: false,
      error: "That code has expired.",
    });
    expect(validatePromoCode(code, { ...ctx, liveRedemptions: 2 })).toEqual({
      ok: false,
      error: "That code has been used up.",
    });
    expect(validatePromoCode(code, { ...ctx, customerRedemptions: 1 })).toEqual({
      ok: false,
      error: "You've already used that code.",
    });
    expect(validatePromoCode({ ...code, min_total_pence: 15000 }, ctx)).toEqual({
      ok: false,
      error: "That code needs a booking of at least £150.00.",
    });
  });

  it("allows an unlimited code and a higher per-customer limit", () => {
    expect(validatePromoCode({ ...code, max_redemptions: null }, { ...ctx, liveRedemptions: 999 }).ok).toBe(true);
    expect(validatePromoCode({ ...code, per_customer_limit: 3 }, { ...ctx, customerRedemptions: 2 }).ok).toBe(true);
  });
});

describe("chargeAfterDiscounts", () => {
  it("takes the discount first, then credit on what's left", () => {
    expect(chargeAfterDiscounts(12000, 1200, 5000)).toEqual({
      discountPence: 1200,
      creditPence: 5000,
      chargePence: 5800,
    });
  });

  it("never lets credit or discount exceed the total, and floors the charge at zero", () => {
    expect(chargeAfterDiscounts(5000, 2000, 9000)).toEqual({ discountPence: 2000, creditPence: 3000, chargePence: 0 });
    expect(chargeAfterDiscounts(5000, 9000, 1000)).toEqual({ discountPence: 5000, creditPence: 0, chargePence: 0 });
    expect(chargeAfterDiscounts(5000, 0, 0)).toEqual({ discountPence: 0, creditPence: 0, chargePence: 5000 });
    expect(chargeAfterDiscounts(5000, -5, -5)).toEqual({ discountPence: 0, creditPence: 0, chargePence: 5000 });
  });
});

describe("normalisePromoCode + promoOfferLabel", () => {
  it("uppercases and strips whitespace", () => {
    expect(normalisePromoCode(" welcome 10 ")).toBe("WELCOME10");
    expect(normalisePromoCode(null)).toBe("");
  });
  it("labels the offer", () => {
    expect(promoOfferLabel({ kind: "percent", value: 10 })).toBe("10% off");
    expect(promoOfferLabel({ kind: "fixed", value: 1500 })).toBe("£15.00 off");
  });
});
