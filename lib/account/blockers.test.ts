import { describe, it, expect } from "vitest";
import {
  deletionBlocker,
  deletedSentinelEmail,
  isDeletedSentinelEmail,
  LIVE_BOOKING_STATUSES,
} from "./blockers";

// The rule that decides whether an account can go. The app shows the sentence
// verbatim and mirrors none of these sets, so these pin down exactly which
// states refuse and which do not.

const NOW = new Date("2026-09-10T12:00:00Z");
const future = "2026-09-15T12:00:00Z";
const past = "2026-09-01T12:00:00Z";

describe("deletionBlocker — nothing in the way", () => {
  it("allows an account with no bookings", () => {
    expect(deletionBlocker([], NOW)).toBeNull();
  });

  it("allows completed and cancelled bookings, including one inside the dispute window", () => {
    expect(
      deletionBlocker(
        [
          { status: "completed", disputes: [], job_quotes: [] },
          { status: "cancelled" },
          { status: "completed", disputes: [{ status: "resolved" }, { status: "withdrawn" }] },
        ],
        NOW,
      ),
    ).toBeNull();
  });

  it("ignores quotes that are answered, withdrawn or expired", () => {
    expect(
      deletionBlocker(
        [
          {
            status: "completed",
            job_quotes: [
              { status: "approved", expires_at: future },
              { status: "declined", expires_at: future },
              { status: "withdrawn", expires_at: null },
              { status: "expired", expires_at: past },
              { status: "draft", expires_at: null },
              // Sent but past its expiry: the cron will mark it; not a blocker.
              { status: "sent", expires_at: past },
            ],
          },
        ],
        NOW,
      ),
    ).toBeNull();
  });
});

describe("deletionBlocker — live_booking", () => {
  it.each([...LIVE_BOOKING_STATUSES])("refuses while a booking is %s", (status) => {
    expect(deletionBlocker([{ status: "completed" }, { status }], NOW)).toMatchObject({
      code: "live_booking",
    });
  });

  it("is exactly the four live statuses", () => {
    expect([...LIVE_BOOKING_STATUSES].sort()).toEqual(
      ["confirmed", "en_route", "in_progress", "sourcing_mechanic"].sort(),
    );
  });

  it("wins over a dispute or quote on another booking", () => {
    expect(
      deletionBlocker(
        [
          { status: "completed", disputes: [{ status: "opened" }] },
          { status: "confirmed" },
        ],
        NOW,
      ),
    ).toMatchObject({ code: "live_booking" });
  });
});

describe("deletionBlocker — open_dispute", () => {
  it.each(["opened", "responded", "escalated"])("refuses while a dispute is %s", (status) => {
    expect(
      deletionBlocker([{ status: "completed", disputes: [{ status }] }], NOW),
    ).toMatchObject({ code: "open_dispute" });
  });

  it("counts a dispute the mechanic opened just the same", () => {
    // The row carries no opener here on purpose: whoever opened it, it is on
    // this customer's booking and still needs an answer.
    expect(
      deletionBlocker([{ status: "cancelled", disputes: [{ status: "responded" }] }], NOW),
    ).toMatchObject({ code: "open_dispute" });
  });

  it("wins over a pending quote", () => {
    expect(
      deletionBlocker(
        [
          { status: "completed", job_quotes: [{ status: "sent", expires_at: future }] },
          { status: "completed", disputes: [{ status: "escalated" }] },
        ],
        NOW,
      ),
    ).toMatchObject({ code: "open_dispute" });
  });
});

describe("deletionBlocker — pending_quote", () => {
  it("refuses while a sent quote is unanswered", () => {
    expect(
      deletionBlocker(
        [{ status: "completed", job_quotes: [{ status: "sent", expires_at: future }] }],
        NOW,
      ),
    ).toMatchObject({ code: "pending_quote" });
  });

  it("treats a sent quote with no expiry as open", () => {
    expect(
      deletionBlocker(
        [{ status: "completed", job_quotes: [{ status: "sent", expires_at: null }] }],
        NOW,
      ),
    ).toMatchObject({ code: "pending_quote" });
  });

  it("uses the exact expiry instant", () => {
    const atExpiry = NOW.toISOString();
    expect(
      deletionBlocker(
        [{ status: "completed", job_quotes: [{ status: "sent", expires_at: atExpiry }] }],
        NOW,
      ),
    ).toBeNull();
  });
});

describe("the refusal sentences", () => {
  it("are the ones the app's copy was written against", () => {
    expect(deletionBlocker([{ status: "confirmed" }], NOW)?.error).toBe(
      "You have a booking in progress. Cancel it or wait until it's finished, then try again.",
    );
    expect(deletionBlocker([{ status: "completed", disputes: [{ status: "opened" }] }], NOW)?.error).toBe(
      "You have an open dispute. Once it's resolved you can delete your account.",
    );
    expect(
      deletionBlocker(
        [{ status: "completed", job_quotes: [{ status: "sent", expires_at: null }] }],
        NOW,
      )?.error,
    ).toBe("A quote on one of your jobs is still open. Approve or decline it first.");
  });
});

describe("deletedSentinelEmail", () => {
  const id = "3f6c1d2e-8a4b-4c5d-9e0f-1a2b3c4d5e6f";

  it("is deterministic and undeliverable", () => {
    expect(deletedSentinelEmail(id)).toBe(`deleted+${id}@invalid.bookmytech.co.uk`);
    expect(deletedSentinelEmail(id)).toBe(deletedSentinelEmail(id));
  });

  it("is recognised again, and a real address is not", () => {
    expect(isDeletedSentinelEmail(deletedSentinelEmail(id))).toBe(true);
    expect(isDeletedSentinelEmail("alex@example.com")).toBe(false);
    expect(isDeletedSentinelEmail(null)).toBe(false);
    expect(isDeletedSentinelEmail("deleted@bookmytech.co.uk")).toBe(false);
  });
});
