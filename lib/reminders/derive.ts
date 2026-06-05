import { REMINDER_META, type ReminderType } from "./types";

// Pure reminder derivation — given a completed booking's facts, work out which
// future service reminders to schedule. No DB, no I/O, fully unit-testable.
//
// Every reminder is normalised to 09:00 UTC on its target day so the
// (vehicle_reg, type, scheduled_for) unique key in 0023 dedups cleanly across
// re-runs and across multiple bookings for the same car.

export interface DerivedReminder {
  type: ReminderType;
  scheduledFor: Date;
  suggestionSlug: string;
}

export interface DeriveInput {
  /** "Now" — anything scheduled at/before this is dropped (already due/past). */
  now: Date;
  /** When the source job completed. */
  completedAt: Date;
  /** The completed service's slug, used for follow-up rules (e.g. brakes). */
  serviceSlug: string | null;
  /** MOT expiry from DVLA, if known. Drives the mot_due reminder. */
  motExpiry: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 09:00 UTC on the same calendar day as `d`. */
function atNineUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9, 0, 0, 0));
}

/** The next occurrence of (month, day) strictly after `after`, at 09:00 UTC. */
function nextAnnual(after: Date, monthIndex: number, day: number): Date {
  let year = after.getUTCFullYear();
  let candidate = new Date(Date.UTC(year, monthIndex, day, 9, 0, 0, 0));
  if (candidate.getTime() <= after.getTime()) {
    year += 1;
    candidate = new Date(Date.UTC(year, monthIndex, day, 9, 0, 0, 0));
  }
  return candidate;
}

export function deriveReminders(input: DeriveInput): DerivedReminder[] {
  const { now, completedAt, serviceSlug, motExpiry } = input;
  const out: DerivedReminder[] = [];

  const push = (type: ReminderType, when: Date) => {
    if (when.getTime() > now.getTime()) {
      out.push({ type, scheduledFor: when, suggestionSlug: REMINDER_META[type].suggestionSlug });
    }
  };

  // MOT due: 30 days before expiry.
  if (motExpiry) {
    push("mot_due", atNineUtc(new Date(motExpiry.getTime() - 30 * DAY_MS)));
  }

  // Annual service: ~12 months after this job (8,000–12,000 mi/yr ≈ yearly).
  push("annual_service", atNineUtc(new Date(completedAt.getTime() + 365 * DAY_MS)));

  // Seasonal — the next occurrence after whichever is later: now or completion,
  // so a car serviced in December doesn't get an instant winter reminder.
  const seasonalAfter = new Date(Math.max(now.getTime(), completedAt.getTime()));
  push("winter_battery", nextAnnual(seasonalAfter, 9, 1)); // 1 Oct
  push("summer_aircon", nextAnnual(seasonalAfter, 4, 15)); // 15 May

  // Post-job follow-up: brake work → a check 6 months on.
  if (serviceSlug === "brakes-tyres") {
    push("brake_check", atNineUtc(new Date(completedAt.getTime() + 182 * DAY_MS)));
  }

  return out;
}
