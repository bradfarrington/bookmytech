import { describe, expect, it } from "vitest";
import {
  READABLE_ITEM_ID,
  describeDispute,
  describeDocument,
  describeLedgerEntry,
  describeMechanicEvent,
  describeReview,
  escalationClock,
  jobReference,
  type MechanicEvent,
} from "./mechanic-events";

const ME = "11111111-1111-4111-8111-111111111111";
const JOB = { job_number: 4210, vehicle_make: "Ford", vehicle_model: "Focus", customer_name: "Marcus Bell" };

const event = (over: Partial<MechanicEvent>): MechanicEvent => ({
  id: "22222222-2222-4222-8222-222222222222",
  booking_id: "33333333-3333-4333-8333-333333333333",
  event_type: "quote_approved",
  created_at: "2026-09-17T09:00:00.000Z",
  actor_id: "customer-id",
  actor_role: "customer",
  reason: null,
  payload: null,
  ...over,
});

describe("jobReference", () => {
  it("names the job and the car, or whatever stands in for the car", () => {
    expect(jobReference(JOB)).toBe("Job 04210 · Ford Focus");
    expect(jobReference(JOB, "BMT steps in in 47h")).toBe("Job 04210 · BMT steps in in 47h");
    expect(jobReference({ job_number: 12 })).toBe("Job 00012");
    expect(jobReference(null)).toBeNull();
  });
});

describe("describeMechanicEvent", () => {
  it("words what a customer did to the mechanic's job", () => {
    const item = describeMechanicEvent(event({}), ME, JOB);
    expect(item).toMatchObject({ id: `event:${event({}).id}`, tab: "alerts", title: "Quote approved", tone: "success", icon: "quote" });
    expect(item?.link).toEqual({ type: "job", id: event({}).booking_id });
  });

  it("never tells a mechanic what they did themselves", () => {
    expect(describeMechanicEvent(event({ event_type: "cancelled", actor_id: ME, actor_role: "mechanic" }), ME, JOB)).toBeNull();
    expect(describeMechanicEvent(event({ event_type: "dispute_resolved", actor_id: ME, actor_role: "mechanic" }), ME, JOB)).toBeNull();
  });

  it("leaves out everything it has no wording for", () => {
    for (const type of ["message_sent", "payout_transferred", "status_changed", "quote_sent", "note"]) {
      expect(describeMechanicEvent(event({ event_type: type }), ME, JOB)).toBeNull();
    }
  });

  it("says who cancelled", () => {
    expect(describeMechanicEvent(event({ event_type: "cancelled" }), ME, JOB)?.title).toBe("The customer cancelled");
    expect(describeMechanicEvent(event({ event_type: "cancelled", actor_role: "admin" }), ME, JOB)?.title).toBe("Job cancelled by Book My Tech");
  });

  it("tells only the mechanic who LOST a reassigned job", () => {
    const reassigned = (previous: string) =>
      event({ event_type: "mechanic_reassigned", actor_role: "admin", payload: { previous_mechanic_id: previous, mechanic_id: "someone" } });
    expect(describeMechanicEvent(reassigned(ME), ME, JOB)?.title).toBe("Job moved to another mechanic");
    expect(describeMechanicEvent(reassigned("somebody-else"), ME, JOB)).toBeNull();
  });

  it("opens the dispute, not the job, for dispute news", () => {
    const item = describeMechanicEvent(event({ event_type: "dispute_resolved", actor_role: "admin", reason: "No refund", payload: { dispute_id: "d-1" } }), ME, JOB);
    expect(item?.link).toEqual({ type: "dispute", id: "d-1" });
    expect(item?.detail).toBe("No refund");
  });
});

describe("disputes", () => {
  const now = new Date("2026-09-17T10:00:00.000Z");
  const dispute = { id: "d-1", status: "opened", opened_by_role: "customer", reason_category: "workmanship", created_at: "2026-09-17T09:00:00.000Z", responded_at: null };

  it("counts down to Book My Tech stepping in, from the open or the response", () => {
    expect(escalationClock(dispute, now)).toBe("BMT steps in in 47h");
    expect(escalationClock({ ...dispute, status: "responded", responded_at: "2026-09-17T09:30:00.000Z" }, now)).toBe("BMT steps in in 48h");
    expect(escalationClock({ ...dispute, created_at: "2026-09-10T09:00:00.000Z" }, now)).toBe("BMT is stepping in");
    expect(escalationClock({ ...dispute, status: "escalated" }, now)).toBeNull();
  });

  it("is urgent while open, and names the customer without their surname", () => {
    expect(describeDispute(dispute, JOB, now)).toMatchObject({
      title: "Dispute opened by Marcus B",
      detail: "Workmanship",
      reference: "Job 04210 · BMT steps in in 47h",
      urgent: true,
      tone: "danger",
    });
    expect(describeDispute({ ...dispute, status: "resolved" }, JOB, now)).toMatchObject({ urgent: false, tone: "neutral", reference: "Job 04210 · Resolved" });
    expect(describeDispute({ ...dispute, opened_by_role: "mechanic", reason_category: "abusive" }, JOB, now).title).toBe("Issue you raised");
  });
});

describe("payouts and reviews", () => {
  it("words a payout and a clawback from the ledger's signed pence", () => {
    const row = { id: "l-1", entry_type: "payout", amount_pence: -26800, description: "Job 04210 payout", created_at: "2026-09-17T09:00:00.000Z" };
    expect(describeLedgerEntry(row, JOB)).toMatchObject({ title: "Payout sent · £268", tone: "success", link: { type: "earnings" } });
    expect(describeLedgerEntry({ ...row, entry_type: "refund_clawback", amount_pence: -4000 }, JOB)?.title).toBe("£40 taken back for a refund");
    expect(describeLedgerEntry({ ...row, entry_type: "earning" }, JOB)).toBeNull();
  });

  it("words a review", () => {
    expect(describeReview({ id: "r-1", rating: 5, comment: " Spot on ", created_at: "2026-09-17T09:00:00.000Z" }, JOB)).toMatchObject({
      title: "Marcus B left a 5-star review",
      detail: "Spot on",
      avatarName: "Marcus B",
      tone: "success",
    });
    expect(describeReview({ id: "r-2", rating: 2, comment: null, created_at: "2026-09-17T09:00:00.000Z" }, null).tone).toBe("warning");
  });
});

describe("describeDocument", () => {
  const now = new Date("2026-09-17T10:00:00.000Z");
  const doc = { id: "doc-1", doc_type: "trade_insurance", status: "verified", expires_at: "2026-10-10", reviewed_at: null, updated_at: null };

  it("is quiet until 30 days out, then a warning, then urgent inside 14", () => {
    expect(describeDocument({ ...doc, expires_at: "2026-12-01" }, now)).toBeNull();
    expect(describeDocument(doc, now)).toMatchObject({ tab: "bmt", urgent: false, tone: "warning", at: "2026-09-10T00:00:00.000Z" });
    expect(describeDocument(doc, now)?.title).toMatch(/expires in 23 days$/);
    expect(describeDocument({ ...doc, expires_at: "2026-09-25" }, now)).toMatchObject({ urgent: true, tone: "danger", at: "2026-09-11T00:00:00.000Z" });
  });

  it("flags a rejected or expired document, and ignores one still in review", () => {
    expect(describeDocument({ ...doc, status: "rejected", reviewed_at: "2026-09-16T12:00:00.000Z" }, now)).toMatchObject({ urgent: true, at: "2026-09-16T12:00:00.000Z" });
    expect(describeDocument({ ...doc, status: "expired", expires_at: "2026-09-01" }, now)?.title).toMatch(/has expired$/);
    expect(describeDocument({ ...doc, status: "pending_review" }, now)).toBeNull();
  });
});

describe("READABLE_ITEM_ID", () => {
  it("takes the feed's own ids and nothing else", () => {
    expect(READABLE_ITEM_ID.test(`event:${ME}`)).toBe(true);
    expect(READABLE_ITEM_ID.test(`case:${ME}`)).toBe(true);
    expect(READABLE_ITEM_ID.test(`thread:${ME}`)).toBe(false);
    expect(READABLE_ITEM_ID.test(`reminder:${ME}`)).toBe(false);
    expect(READABLE_ITEM_ID.test("event:not-a-uuid")).toBe(false);
  });
});
