import { londonInstant } from "@/lib/slots";

// Pure garage helpers (Task 50), shared by the server and the garage screens:
// registration formatting, how many days until a DVLA date, when a vehicle's
// DVLA details are due a refresh, and the MOT warning.

const DAY_MS = 24 * 60 * 60 * 1000;

/** The garage card turns amber this many days before the MOT runs out. */
export const MOT_WARNING_DAYS = 30;

/** "s28 bsw" → "S28BSW": how the table stores it. */
export function normaliseRegistration(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/** The table's CHECK: 2 to 8 letters and digits. DVLA decides whether it exists. */
export function isRegistrationShape(value: string): boolean {
  return /^[A-Z0-9]{2,8}$/.test(value);
}

/** "AB12CDE" → "AB12 CDE", "S28BSW" → "S28 BSW", "ABC123D" → "ABC 123D". Others unchanged. */
export function formatRegistration(value: string): string {
  const reg = normaliseRegistration(value);
  if (/^[A-Z]{2}[0-9]{2}[A-Z]{3}$/.test(reg)) return `${reg.slice(0, 4)} ${reg.slice(4)}`;
  if (/^[A-Z][0-9]{1,3}[A-Z]{3}$/.test(reg)) return `${reg.slice(0, -3)} ${reg.slice(-3)}`;
  if (/^[A-Z]{3}[0-9]{1,3}[A-Z]$/.test(reg)) return `${reg.slice(0, 3)} ${reg.slice(3)}`;
  return reg;
}

/**
 * Whole days until a DVLA date ("YYYY-MM-DD"): negative once it has passed,
 * null without one. Read as London noon, so the count doesn't shift by one
 * either side of midnight.
 */
export function daysUntil(date: string | null | undefined, now: Date = new Date()): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  // `|| 0` turns the -0 that Math.ceil gives for "later today" into 0.
  return Math.ceil((londonInstant(date, 12).getTime() - now.getTime()) / DAY_MS) || 0;
}

export interface DetailsFreshness {
  detailsCheckedAt: string | null;
  motExpiryDate: string | null;
  taxDueDate: string | null;
}

/**
 * Whether DVLA should be asked again. A week between checks, since MOT and tax
 * dates rarely move; daily once either date is within the warning window or
 * past, because that's when a renewal is likely to change the answer.
 */
export function detailsStale(vehicle: DetailsFreshness, now: Date = new Date()): boolean {
  if (!vehicle.detailsCheckedAt) return true;
  const age = now.getTime() - new Date(vehicle.detailsCheckedAt).getTime();
  if (!Number.isFinite(age)) return true;
  const dueSoon = [vehicle.motExpiryDate, vehicle.taxDueDate].some((date) => {
    const days = daysUntil(date, now);
    return days != null && days <= MOT_WARNING_DAYS;
  });
  return age >= (dueSoon ? DAY_MS : 7 * DAY_MS);
}

export type MotAlert = { kind: "expired" | "due_soon"; days: number } | null;

/** The garage card's MOT warning, or null when there's nothing to say. */
export function motAlert(motExpiryDate: string | null, now: Date = new Date()): MotAlert {
  const days = daysUntil(motExpiryDate, now);
  if (days == null) return null;
  if (days < 0) return { kind: "expired", days };
  if (days <= MOT_WARNING_DAYS) return { kind: "due_soon", days };
  return null;
}
