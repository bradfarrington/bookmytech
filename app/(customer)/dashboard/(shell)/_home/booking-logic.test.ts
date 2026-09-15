import { describe, expect, it } from "vitest";
import type { CustomerBooking } from "@/lib/dashboard/customer-bookings";
import {
  canReportProblem,
  clockLabel,
  firstNameOf,
  greetingDate,
  homeNeedsRefresh,
  jobsDoneLabel,
  mechanicFirstName,
  mechanicShortName,
  pastJobAction,
  paymentNote,
  proposedTime,
  proposedTimeLabel,
  rebookHref,
  shortDate,
  telHref,
  timeAgo,
  waitingOnCustomer,
} from "./booking-logic";

function booking(overrides: Partial<CustomerBooking> = {}): CustomerBooking {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    jobNumber: 42,
    status: "confirmed",
    scheduledAt: "2026-01-20T10:00:00Z",
    slotWindow: "10am–12pm",
    candidateDays: null,
    createdAt: "2026-01-10T10:00:00Z",
    completedAt: null,
    totalPence: 18000,
    partsPricePence: 0,
    discountPence: 0,
    promoCode: null,
    paymentMode: "preauth",
    vehicleReg: "AB12 CDE",
    vehicleMake: "FORD",
    vehicleModel: "FOCUS",
    addressLine1: "14 Oakwood Grove",
    addressLine2: null,
    postcode: "SW11 6PJ",
    parkingType: "driveway",
    specialInstructions: null,
    mechanicId: "22222222-2222-2222-2222-222222222222",
    mechanic: null,
    rescheduleStatus: null,
    rescheduleProposedAt: null,
    rescheduleNote: null,
    repairDescription: "Front brake pads",
    repairNodeId: "p:abc",
    repairNodeIds: ["p:abc"],
    repairLines: ["Front brake pads"],
    hasReport: false,
    pendingQuote: null,
    pendingRevision: null,
    rating: null,
    dispute: null,
    ownedByAccount: true,
    whenLabel: "Tue 20 Jan · 10am–12pm",
    ...overrides,
  };
}

const NOW = new Date("2026-01-15T12:00:00Z");

describe("names", () => {
  it("takes the first word of a full name", () => {
    expect(firstNameOf("Hannah Reid")).toBe("Hannah");
    expect(firstNameOf("  ")).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });

  it("never turns the unnamed fallback into a first name", () => {
    expect(mechanicFirstName("Alex Turner")).toBe("Alex");
    expect(mechanicFirstName("Your mechanic")).toBe("Your mechanic");
    expect(mechanicShortName("James Miller")).toBe("James M");
    expect(mechanicShortName("Cher")).toBe("Cher");
    expect(mechanicShortName("Your mechanic")).toBeNull();
  });

  it("counts jobs", () => {
    expect(jobsDoneLabel(1)).toBe("1 job done");
    expect(jobsDoneLabel(143)).toBe("143 jobs done");
  });
});

describe("dates", () => {
  it("prints the greeting date in UK time", () => {
    expect(greetingDate(NOW)).toBe("Thu, 15 Jan");
    // 23:30 UTC on 1 July is 00:30 on 2 July in BST.
    expect(greetingDate(new Date("2026-07-01T23:30:00Z"))).toBe("Thu, 2 Jul");
  });

  it("adds the year only when it isn't this year", () => {
    expect(shortDate("2026-01-12T10:00:00Z", NOW)).toBe("12 Jan");
    expect(shortDate("2025-08-12T10:00:00Z", NOW)).toBe("12 Aug 2025");
  });

  it("says how long ago in calendar days", () => {
    expect(timeAgo("2026-01-15T08:00:00Z", NOW)).toBe("today");
    expect(timeAgo("2026-01-14T20:00:00Z", NOW)).toBe("yesterday");
    expect(timeAgo("2026-01-12T10:00:00Z", NOW)).toBe("3 days ago");
    expect(timeAgo("2026-01-01T10:00:00Z", NOW)).toBe("2 weeks ago");
    expect(timeAgo("2025-11-15T10:00:00Z", NOW)).toBe("2 months ago");
    expect(timeAgo("2024-01-10T10:00:00Z", NOW)).toBe("2 years ago");
    expect(timeAgo("not a date", NOW)).toBe("");
  });

  it("labels a proposed time in UK time", () => {
    expect(proposedTimeLabel("2026-01-15T14:00:00Z")).toBe("Thu 15 Jan at 2pm");
    // 13:30 UTC is 14:30 BST.
    expect(proposedTimeLabel("2026-07-02T13:30:00Z")).toBe("Thu 2 Jul at 2:30pm");
    expect(clockLabel(new Date("2026-01-15T00:05:00Z"))).toBe("12:05am");
    expect(proposedTimeLabel("nope")).toBe("a new time");
  });
});

describe("telHref", () => {
  it("strips spaces and punctuation but keeps a leading +", () => {
    expect(telHref("+44 7700 900123")).toBe("tel:+447700900123");
    expect(telHref("07700-900 123")).toBe("tel:07700900123");
  });
});

describe("rebookHref", () => {
  it("deep-links to the match step with every repair and the preferred mechanic", () => {
    const href = rebookHref(booking({ repairNodeIds: ["p:abc", "n:9"] }), "mech-1");
    const url = new URL(href, "https://example.test");
    expect(url.pathname).toBe("/book/match");
    expect(url.searchParams.get("reg")).toBe("AB12 CDE");
    expect(url.searchParams.get("repairs")).toBe("p:abc,n:9");
    expect(url.searchParams.get("postcode")).toBe("SW11 6PJ");
    expect(url.searchParams.get("make")).toBe("FORD");
    expect(url.searchParams.get("model")).toBe("FOCUS");
    expect(url.searchParams.get("pref")).toBe("mech-1");
  });

  it("starts the booking flow when the repairs aren't known", () => {
    expect(rebookHref(booking({ repairNodeIds: [] }))).toBe("/book?reg=AB12%20CDE");
    expect(rebookHref(booking(), null)).not.toContain("pref=");
  });
});

describe("canReportProblem", () => {
  it("allows a completed job for 48 hours, once", () => {
    const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
    expect(canReportProblem(booking({ status: "completed", completedAt: hoursAgo(47) }), NOW)).toBe(true);
    expect(canReportProblem(booking({ status: "completed", completedAt: hoursAgo(49) }), NOW)).toBe(false);
    expect(
      canReportProblem(
        booking({ status: "completed", completedAt: hoursAgo(1), dispute: { id: "d1", status: "opened" } }),
        NOW,
      ),
    ).toBe(false);
    expect(canReportProblem(booking({ status: "cancelled", completedAt: hoursAgo(1) }), NOW)).toBe(false);
  });

  it("isn't offered on a guest-era booking the disputes page would refuse", () => {
    const hourAgo = new Date(NOW.getTime() - 3_600_000).toISOString();
    expect(
      canReportProblem(booking({ status: "completed", completedAt: hourAgo, ownedByAccount: false }), NOW),
    ).toBe(false);
  });
});

describe("pastJobAction", () => {
  it("points at the dispute first", () => {
    expect(pastJobAction(booking({ status: "disputed", dispute: { id: "d1", status: "opened" } }))).toEqual({
      label: "View dispute",
      href: "/dashboard/disputes/d1",
    });
  });

  it("asks for a rating on an unrated completed job", () => {
    const b = booking({ status: "completed" });
    expect(pastJobAction(b)).toEqual({ label: "Rate your mechanic", href: `/dashboard/bookings/${b.id}/review` });
  });

  it("offers Book again once rated, or after a cancellation", () => {
    expect(pastJobAction(booking({ status: "completed", rating: 5 }))?.label).toBe("Book again");
    expect(pastJobAction(booking({ status: "cancelled", mechanicId: null }))?.label).toBe("Book again");
    expect(pastJobAction(booking({ status: "completed", rating: 5 }))?.href).toContain("pref=");
  });

  it("offers nothing for a disputed job with no case to show", () => {
    expect(pastJobAction(booking({ status: "disputed" }))).toBeNull();
  });
});

describe("waitingOnCustomer", () => {
  it("lists revisions, then quotes, then proposed times, soonest booking first", () => {
    const later = booking({
      id: "later",
      scheduledAt: "2026-02-01T10:00:00Z",
      pendingQuote: { id: "q2", totalPence: 5000, kind: "now", title: null },
    });
    const sooner = booking({
      id: "sooner",
      scheduledAt: "2026-01-16T10:00:00Z",
      pendingQuote: { id: "q1", totalPence: 21000, kind: "now", title: "Rear pads" },
      rescheduleStatus: "proposed",
      rescheduleProposedAt: "2026-01-17T14:00:00Z",
    });
    const live = booking({
      id: "live",
      status: "in_progress",
      scheduledAt: "2026-03-01T10:00:00Z",
      pendingRevision: { id: "r1", afterTotalPence: 22500, differencePence: 4500, repairDescription: "Pads and discs" },
    });
    expect(waitingOnCustomer([later, sooner, live]).map((item) => item.key)).toEqual([
      "revision-r1",
      "quote-q1",
      "quote-q2",
      "reschedule-sooner",
    ]);
  });

  it("ignores a proposal left on a finished booking", () => {
    const done = booking({ status: "cancelled", rescheduleStatus: "proposed", rescheduleProposedAt: "2026-01-17T14:00:00Z" });
    expect(proposedTime(done)).toBeNull();
    expect(waitingOnCustomer([done])).toEqual([]);
  });
});

describe("paymentNote", () => {
  it("explains a pre-authorisation until the job is complete", () => {
    expect(paymentNote(booking({ status: "confirmed" }))).toContain("pre-authorised");
    expect(paymentNote(booking({ status: "completed" }))).toContain("taken when the job was completed");
  });

  it("says what covered a free booking", () => {
    expect(paymentNote(booking({ paymentMode: "free", discountPence: 18000 }))).toContain("by your discount,");
    expect(paymentNote(booking({ paymentMode: "free", discountPence: 5000 }))).toContain("discount and account credit");
    expect(paymentNote(booking({ paymentMode: "free" }))).toContain("by your account credit");
  });

  it("says nothing it can't be sure of", () => {
    expect(paymentNote(booking({ status: "cancelled" }))).toBeNull();
    expect(paymentNote(booking({ status: "disputed" }))).toBeNull();
  });
});

describe("homeNeedsRefresh", () => {
  it("refreshes while a job is live or still finding a mechanic", () => {
    expect(homeNeedsRefresh([booking({ status: "completed" }), booking({ status: "confirmed" })])).toBe(false);
    expect(homeNeedsRefresh([booking({ status: "en_route" })])).toBe(true);
    expect(homeNeedsRefresh([booking({ status: "sourcing_mechanic" })])).toBe(true);
  });
});
