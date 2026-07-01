import { describe, it, expect } from "vitest";
import { calcEarnings, nettedPayout } from "./earnings";

describe("calcEarnings", () => {
  it("takes commission on the whole total, mechanic keeps the rest", () => {
    const e = calcEarnings(10_000, 0.15);
    expect(e.platformFeePence).toBe(1_500);
    expect(e.mechanicPence).toBe(8_500);
  });
});

describe("nettedPayout", () => {
  it("pays the full payout when the mechanic has no debt", () => {
    expect(nettedPayout(0, 5_000)).toEqual({ transferPence: 5_000, recoveredPence: 0 });
  });

  it("nets a partial debt off the payout and pays the surplus", () => {
    // Owes £3, earns £50 → transfer £47, recover £3.
    expect(nettedPayout(-300, 5_000)).toEqual({ transferPence: 4_700, recoveredPence: 300 });
  });

  it("withholds the whole payout when the debt exceeds it", () => {
    // Owes £60, earns £50 → transfer £0, recover the whole £50 (still owes £10).
    expect(nettedPayout(-6_000, 5_000)).toEqual({ transferPence: 0, recoveredPence: 5_000 });
  });

  it("recovers exactly the debt when the payout equals it", () => {
    expect(nettedPayout(-5_000, 5_000)).toEqual({ transferPence: 0, recoveredPence: 5_000 });
  });

  it("carries a positive prior balance forward without a bogus recovery", () => {
    // BMT already owed £4 (a failed transfer); recoveredPence must never go negative.
    const r = nettedPayout(400, 5_000);
    expect(r.recoveredPence).toBe(0);
    expect(r.transferPence).toBe(5_400);
  });

  it("treats a zero payout as nothing to transfer or recover", () => {
    expect(nettedPayout(-300, 0)).toEqual({ transferPence: 0, recoveredPence: 0 });
  });

  it("rounds fractional pence inputs", () => {
    // round(-100.4) = -100, round(2000.6) = 2001 → transfer 1901, recover 100.
    expect(nettedPayout(-100.4, 2_000.6)).toEqual({ transferPence: 1_901, recoveredPence: 100 });
  });
});
