import { describe, it, expect } from "vitest";
import { jobMoney } from "./job-money";
import { joinCancelReason } from "./cancel-reasons";

describe("jobMoney", () => {
  const booking = {
    total_pence: 18000,
    commission_rate: 0.15,
    platform_fee_pence: 2700,
    credit_applied_pence: 0,
    discount_pence: 0,
  };

  it("takes BMT-sourced parts, and only those, off the mechanic's take-home", () => {
    const money = jobMoney(booking, [
      { total_pence: 8100, sourcing: "bmt" },
      { total_pence: 2500, sourcing: "self" },
    ]);
    expect(money).toEqual({
      customerPaysPence: 18000,
      chargePence: 18000,
      bmtPartsPence: 8100,
      platformFeePence: 2700,
      commissionRate: 0.15,
      payoutPence: 7200,
    });
  });

  it("charges the total less credit and discount, never below zero, without touching the payout", () => {
    const part = jobMoney({ ...booking, credit_applied_pence: 5000, discount_pence: 1000 }, []);
    expect(part.chargePence).toBe(12000);
    expect(part.payoutPence).toBe(15300);
    expect(jobMoney({ ...booking, credit_applied_pence: 20000 }, []).chargePence).toBe(0);
  });

  it("falls back to 15% and works the fee out when the booking has no snapshot", () => {
    const money = jobMoney({ total_pence: 10000, commission_rate: null }, []);
    expect(money.commissionRate).toBe(0.15);
    expect(money.platformFeePence).toBe(1500);
    expect(money.payoutPence).toBe(8500);
  });
});

describe("joinCancelReason", () => {
  it("joins a reason and its detail the way the website always has", () => {
    expect(joinCancelReason("Unwell", "  back Thursday ")).toBe("Unwell: back Thursday");
    expect(joinCancelReason("Unwell", "   ")).toBe("Unwell");
    expect(joinCancelReason("Other")).toBe("Other");
  });
});
