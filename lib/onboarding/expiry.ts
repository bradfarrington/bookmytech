// Expiry status helpers for mechanic documents (Task 07 Stage 3). Plain module
// so both server pages and the cron route can use it.

export type ExpiryState = "ok" | "expiring_soon" | "expired" | "none";

export const EXPIRY_WARN_DAYS = 30;
// Reminder milestones (days before expiry) the cron emails on.
export const REMINDER_DAYS = [30, 7, 0] as const;

/** Whole days from `now` until the given date (UTC date-only). Negative = past. */
export function daysUntil(expiresAt: string | null, now: number = Date.now()): number | null {
  if (!expiresAt) return null;
  const exp = new Date(expiresAt + "T00:00:00Z").getTime();
  const today = new Date(new Date(now).toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  return Math.round((exp - today) / (24 * 60 * 60 * 1000));
}

export function expiryState(expiresAt: string | null, now: number = Date.now()): ExpiryState {
  const d = daysUntil(expiresAt, now);
  if (d == null) return "none";
  if (d < 0) return "expired";
  if (d <= EXPIRY_WARN_DAYS) return "expiring_soon";
  return "ok";
}
