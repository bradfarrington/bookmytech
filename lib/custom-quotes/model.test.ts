import { describe, expect, it } from "vitest";
import {
  buildCustomQuote,
  cleanAdminQuote,
  cleanQuoteRequest,
  customQuoteRefusal,
  ownsCustomQuote,
  toCustomQuoteView,
  type CustomQuoteRow,
} from "./model";
import { quoteRequestHref } from "./href";

const row: CustomQuoteRow = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "sent",
  source: "customer",
  customer_id: null,
  customer_name: "Alex Smith",
  customer_email: "alex@example.com",
  customer_phone: null,
  vehicle_reg: "AB12CDE",
  vehicle_make: "FORD",
  vehicle_model: "Focus",
  postcode: "B79 9DX",
  request_text: "Rear wiper stopped",
  title: "Replace the rear wiper motor",
  details: "Motor and fitting",
  total_pence: 14500,
  visit_hours: "1.50",
  hourly_rate_pence: 6000,
  commission_rate: "0.2000",
  sent_at: "2026-11-13T10:00:00Z",
  responded_at: null,
  booking_id: null,
  created_at: "2026-11-13T09:00:00Z",
  updated_at: "2026-11-13T10:00:00Z",
};

describe("a customer's request", () => {
  it("cleans a good request and normalises the reg and email", () => {
    const r = cleanQuoteRequest({ reg: "ab12 cde", description: "Rear wiper stopped", name: " Alex ", email: "Alex@Example.com" });
    expect(r).toEqual({
      ok: true,
      request: expect.objectContaining({ vehicle_reg: "AB12CDE", customer_email: "alex@example.com", customer_name: "Alex" }),
    });
  });

  it("refuses with a sentence the customer can act on", () => {
    expect(cleanQuoteRequest({ reg: "", description: "x", name: "A", email: "a@b.co" })).toEqual({ ok: false, error: "Enter your registration number." });
    expect(cleanQuoteRequest({ reg: "AB12CDE", description: "x", name: "A", email: "a@b.co" })).toMatchObject({ ok: false });
    expect(cleanQuoteRequest({ reg: "AB12CDE", description: "Wiper motor", name: "A", email: "nope" })).toEqual({ ok: false, error: "Enter a valid email address." });
  });
});

describe("the admin's quote", () => {
  const base = { customerName: "Alex", customerEmail: "alex@example.com", reg: "AB12CDE" };
  it("saves a draft without a price, but won't send one", () => {
    expect(cleanAdminQuote(base, false).ok).toBe(true);
    expect(cleanAdminQuote({ ...base, make: "Ford", title: "Wiper motor" }, true)).toEqual({ ok: false, error: "Enter the price before sending." });
    expect(cleanAdminQuote({ ...base, title: "Wiper motor", totalPence: 14500 }, true)).toEqual({ ok: false, error: "Enter the vehicle's make before sending." });
    const sent = cleanAdminQuote({ ...base, make: "Ford", title: "Wiper motor", totalPence: "14500", visitHours: "1.5" }, true);
    expect(sent).toMatchObject({ ok: true, quote: { total_pence: 14500, visit_hours: 1.5 } });
  });
  it("refuses a zero or silly price", () => {
    expect(cleanAdminQuote({ ...base, totalPence: 0 }, false).ok).toBe(false);
    expect(cleanAdminQuote({ ...base, totalPence: 999_999_999 }, false).ok).toBe(false);
  });
});

describe("booking a custom quote", () => {
  it("prices it at the quoted total with the commission snapshotted when sent", () => {
    const quote = buildCustomQuote(row, { hourlyRatePence: 9999, commissionRate: 0.5 })!;
    expect(quote.breakdown.totalPence).toBe(14500);
    expect(quote.breakdown.commissionRate).toBe(0.2);
    expect(quote.breakdown.platformFeePence).toBe(2900);
    expect(quote.breakdown.mechanicPayoutPence).toBe(11600);
    expect(quote.visitHours).toBe(1.5);
    expect(quote.description).toBe("Replace the rear wiper motor");
    expect(quote.itemIds).toEqual([`q:${row.id}`]);
    expect(quote.parts).toEqual([]);
  });

  it("falls back to today's figures for a quote sent without a snapshot", () => {
    const quote = buildCustomQuote({ ...row, commission_rate: null, hourly_rate_pence: null }, { hourlyRatePence: 6000, commissionRate: 0.25 })!;
    expect(quote.breakdown.platformFeePence).toBe(3625);
  });

  it("only lets the account it was sent to book it", () => {
    expect(ownsCustomQuote(row, { userId: "u1", email: "ALEX@example.com" })).toBe(true);
    expect(ownsCustomQuote(row, { userId: "u1", email: "someone@else.com" })).toBe(false);
    expect(ownsCustomQuote({ ...row, customer_id: "u1" }, { userId: "u1", email: null })).toBe(true);
  });

  it("is open until either side cancels", () => {
    expect(customQuoteRefusal(row)).toBeNull();
    expect(customQuoteRefusal({ ...row, status: "requested" })).toMatch(/still pricing/);
    expect(customQuoteRefusal({ ...row, status: "declined" })).toMatch(/declined/);
    expect(customQuoteRefusal({ ...row, status: "withdrawn" })).toMatch(/cancelled/);
    expect(customQuoteRefusal({ ...row, status: "booked", booking_id: "b" })).toMatch(/already booked/);
  });

  it("hides the price until it's priced, for the app", () => {
    const view = toCustomQuoteView({ ...row, status: "requested" });
    expect(view).toMatchObject({ title: null, totalPence: null, canBook: false, canDecline: true, visitHours: 1.5 });
    expect(toCustomQuoteView(row)).toMatchObject({ totalPence: 14500, canBook: true });
  });
});

describe("the ask-for-a-quote link", () => {
  it("carries the car and the search", () => {
    expect(quoteRequestHref({ reg: "AB12CDE", make: "FORD", q: " rear wiper " })).toBe(
      "/book/quote/request?reg=AB12CDE&make=FORD&q=rear+wiper",
    );
  });
});
