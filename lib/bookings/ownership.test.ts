import { describe, it, expect } from "vitest";
import { ownsBooking } from "./ownership";

// The rule that keeps a customer out of someone else's job. A 200 on your own
// booking proves nothing about someone else's, which is what these pin down.

const ME = { userId: "user-me", email: "me@example.com" };
const THEM = { userId: "user-them", email: "them@example.com" };

describe("ownsBooking — account-owned bookings", () => {
  const mine = { customer_id: "user-me", customer_email: "me@example.com" };

  it("lets the owner through", () => {
    expect(ownsBooking(mine, ME)).toBe(true);
  });

  it("refuses anyone else, even knowing the booking", () => {
    expect(ownsBooking(mine, THEM)).toBe(false);
  });

  it("refuses a caller whose email matches but whose id does not", () => {
    // Someone who booked as a guest on this email and later made a DIFFERENT
    // account. customer_id is set, so it is the only thing that counts —
    // matching on the email here would let the older guest identity be claimed.
    expect(ownsBooking(mine, { userId: "user-other", email: "me@example.com" })).toBe(false);
  });
});

describe("ownsBooking — guest bookings (no customer_id)", () => {
  const guest = { customer_id: null, customer_email: "me@example.com" };

  it("matches on email when the booking has no account behind it", () => {
    expect(ownsBooking(guest, ME)).toBe(true);
  });

  it("refuses a different email", () => {
    expect(ownsBooking(guest, THEM)).toBe(false);
  });

  it("is case-sensitive, matching auth.email() in RLS", () => {
    // Looser matching here would let an action reach a booking the same caller
    // cannot READ under the policy — the wrong direction to diverge in.
    expect(ownsBooking(guest, { userId: "user-me", email: "ME@example.com" })).toBe(false);
  });
});

describe("ownsBooking — the null-equals-null trap", () => {
  // In Postgres `null = null` is null and the policy fails closed. In
  // TypeScript `null === null` is true, so a naive port hands every emailless
  // guest booking to every emailless caller.
  it("refuses a caller with no email against a booking with no email", () => {
    expect(
      ownsBooking({ customer_id: null, customer_email: null }, { userId: "user-me", email: null }),
    ).toBe(false);
  });

  it("refuses a caller with no email against a booking that has one", () => {
    expect(
      ownsBooking({ customer_id: null, customer_email: "me@example.com" }, { userId: "user-me", email: null }),
    ).toBe(false);
  });

  it("refuses a real email against a booking with none", () => {
    expect(ownsBooking({ customer_id: null, customer_email: null }, ME)).toBe(false);
  });

  it("refuses an empty-string email on either side", () => {
    expect(ownsBooking({ customer_id: null, customer_email: "" }, { userId: "user-me", email: "" })).toBe(
      false,
    );
  });
});
