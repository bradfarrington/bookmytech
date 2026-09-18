// What stops a MECHANIC deleting their account (Task 70). Pure — no I/O — so
// the one rule that decides "not yet" can be read in a screen and tested
// exhaustively (mechanic-blockers.test.ts). The twin of ./blockers.ts, which
// does the same job for a customer.
//
// The app shows `error` to the mechanic VERBATIM and mirrors none of these
// lists, so widening or narrowing a set is ours alone. Adding a fifth code is
// safe (the app shows the sentence regardless) but tell Brad.

export type MechanicDeletionBlockerCode =
  | "live_booking"
  | "open_dispute"
  | "open_case"
  | "balance_owed";

export interface MechanicDeletionBlocker {
  code: MechanicDeletionBlockerCode;
  error: string;
}

/**
 * Booking statuses that mean this mechanic is committed to a job. Narrower than
 * the customer's set: `sourcing_mechanic` has no mechanic on it, so it can never
 * be one of theirs, and a live OFFER is not a commitment — the deletion simply
 * supersedes it.
 */
export const MECHANIC_LIVE_BOOKING_STATUSES: ReadonlySet<string> = new Set([
  "confirmed",
  "en_route",
  "in_progress",
]);

/** Dispute statuses that are still someone's problem. Matches ./blockers.ts. */
export const MECHANIC_OPEN_DISPUTE_STATUSES: ReadonlySet<string> = new Set([
  "opened",
  "responded",
  "escalated",
]);

/** Resolution-case statuses still waiting on Book My Tech or the mechanic. */
export const MECHANIC_OPEN_CASE_STATUSES: ReadonlySet<string> = new Set([
  "open",
  "in_progress",
]);

export interface MechanicBlockerInput {
  /** Statuses of every booking assigned to this mechanic. */
  bookingStatuses: ReadonlyArray<string>;
  /** Statuses of every dispute on one of their jobs. */
  disputeStatuses: ReadonlyArray<string>;
  /** Statuses of every Get-help case raised about them. */
  caseStatuses: ReadonlyArray<string>;
  /**
   * `SUM(mechanic_ledger.amount_pence)`. Positive = Book My Tech owes them,
   * negative = they owe Book My Tech. Either way it has to settle first.
   */
  balancePence: number;
}

const MESSAGES: Record<MechanicDeletionBlockerCode, string> = {
  live_booking:
    "You have a job in progress. Finish or cancel it, then try again.",
  open_dispute:
    "You have an open dispute. Once it's resolved you can delete your account.",
  open_case:
    "You have an open Get-help case. Close it, or wait for Book My Tech to, then try again.",
  balance_owed:
    "Your balance isn't settled yet. Contact Book My Tech to clear it, then try again.",
};

/**
 * The first reason this mechanic can't be deleted yet, or null when they can.
 * Checked in the order they can act on them: a live job is the loudest thing on
 * their screen, then a dispute, then a case, then the money — which is the one
 * they cannot clear themselves.
 */
export function mechanicDeletionBlocker(
  input: MechanicBlockerInput,
): MechanicDeletionBlocker | null {
  if (input.bookingStatuses.some((s) => MECHANIC_LIVE_BOOKING_STATUSES.has(s))) {
    return { code: "live_booking", error: MESSAGES.live_booking };
  }
  if (input.disputeStatuses.some((s) => MECHANIC_OPEN_DISPUTE_STATUSES.has(s))) {
    return { code: "open_dispute", error: MESSAGES.open_dispute };
  }
  if (input.caseStatuses.some((s) => MECHANIC_OPEN_CASE_STATUSES.has(s))) {
    return { code: "open_case", error: MESSAGES.open_case };
  }
  // Either direction blocks: money we owe them must be paid before the account
  // goes, and money they owe us must be recovered while there is still someone
  // to recover it from.
  if (Math.round(input.balancePence || 0) !== 0) {
    return { code: "balance_owed", error: MESSAGES.balance_owed };
  }
  return null;
}
