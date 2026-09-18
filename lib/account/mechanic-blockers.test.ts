import { describe, it, expect } from "vitest";
import {
  mechanicDeletionBlocker,
  MECHANIC_LIVE_BOOKING_STATUSES,
  MECHANIC_OPEN_CASE_STATUSES,
  MECHANIC_OPEN_DISPUTE_STATUSES,
  type MechanicBlockerInput,
} from "./mechanic-blockers";

// The rule that decides whether a mechanic's account can go. The app shows the
// sentence verbatim and mirrors none of these sets, so these pin down exactly
// which states refuse and which do not.

const CLEAR: MechanicBlockerInput = {
  bookingStatuses: [],
  disputeStatuses: [],
  caseStatuses: [],
  balancePence: 0,
};

const input = (patch: Partial<MechanicBlockerInput>): MechanicBlockerInput => ({
  ...CLEAR,
  ...patch,
});

describe("mechanicDeletionBlocker — nothing in the way", () => {
  it("allows a brand-new mechanic with nothing at all", () => {
    expect(mechanicDeletionBlocker(CLEAR)).toBeNull();
  });

  it("allows completed and cancelled jobs, settled disputes and closed cases", () => {
    expect(
      mechanicDeletionBlocker(
        input({
          bookingStatuses: ["completed", "cancelled", "completed"],
          disputeStatuses: ["resolved", "withdrawn"],
          caseStatuses: ["resolved", "closed"],
        }),
      ),
    ).toBeNull();
  });

  it("does not treat a job still looking for a mechanic as theirs", () => {
    // `sourcing_mechanic` has no mechanic on it, so it can never be assigned
    // to this caller — unlike the customer's set, where it blocks.
    expect(mechanicDeletionBlocker(input({ bookingStatuses: ["sourcing_mechanic"] }))).toBeNull();
  });
});

describe("mechanicDeletionBlocker — live work", () => {
  it.each([...MECHANIC_LIVE_BOOKING_STATUSES])("refuses while a job is %s", (status) => {
    expect(mechanicDeletionBlocker(input({ bookingStatuses: [status] }))).toMatchObject({
      code: "live_booking",
    });
  });

  it("finds the live job among finished ones", () => {
    expect(
      mechanicDeletionBlocker(
        input({ bookingStatuses: ["completed", "cancelled", "en_route", "completed"] }),
      ),
    ).toMatchObject({ code: "live_booking" });
  });
});

describe("mechanicDeletionBlocker — disputes and cases", () => {
  it.each([...MECHANIC_OPEN_DISPUTE_STATUSES])("refuses while a dispute is %s", (status) => {
    expect(mechanicDeletionBlocker(input({ disputeStatuses: [status] }))).toMatchObject({
      code: "open_dispute",
    });
  });

  it.each([...MECHANIC_OPEN_CASE_STATUSES])("refuses while a case is %s", (status) => {
    expect(mechanicDeletionBlocker(input({ caseStatuses: [status] }))).toMatchObject({
      code: "open_case",
    });
  });
});

describe("mechanicDeletionBlocker — the money", () => {
  it("refuses while Book My Tech owes them", () => {
    expect(mechanicDeletionBlocker(input({ balancePence: 26_800 }))).toMatchObject({
      code: "balance_owed",
    });
  });

  it("refuses while they owe Book My Tech a fronted refund", () => {
    expect(mechanicDeletionBlocker(input({ balancePence: -4_500 }))).toMatchObject({
      code: "balance_owed",
    });
  });

  it("allows a settled ledger", () => {
    expect(mechanicDeletionBlocker(input({ balancePence: 0 }))).toBeNull();
  });
});

describe("mechanicDeletionBlocker — order", () => {
  it("names the live job first, because it is the one they can act on now", () => {
    expect(
      mechanicDeletionBlocker({
        bookingStatuses: ["in_progress"],
        disputeStatuses: ["opened"],
        caseStatuses: ["open"],
        balancePence: -100,
      }),
    ).toMatchObject({ code: "live_booking" });
  });

  it("names the money last, because it is the one they cannot", () => {
    expect(
      mechanicDeletionBlocker({
        bookingStatuses: ["completed"],
        disputeStatuses: ["resolved"],
        caseStatuses: ["closed"],
        balancePence: -100,
      }),
    ).toMatchObject({ code: "balance_owed" });
  });

  it("gives every refusal a sentence written for a mechanic", () => {
    for (const patch of [
      { bookingStatuses: ["confirmed"] },
      { disputeStatuses: ["opened"] },
      { caseStatuses: ["open"] },
      { balancePence: 1 },
    ]) {
      const blocker = mechanicDeletionBlocker(input(patch));
      expect(blocker?.error).toMatch(/\.$/);
      expect(blocker?.error).not.toMatch(/\b(null|undefined|error|status)\b/i);
    }
  });
});
