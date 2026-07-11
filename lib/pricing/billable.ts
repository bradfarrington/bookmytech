// Billable-hours rounding (Task 16, owner decision 2026-07-09).
//
// Vehicle-specific OEM book times are billed in WHOLE hours, always rounding
// up, with a 1-hour minimum:
//
//   0.2 → 1   0.7 → 1   1.0 → 1   1.2 → 2   1.5 → 2   1.6 → 2   2.0 → 2   2.3 → 3
//
// This applies ONLY to the HaynesPro-derived duration. Admin-entered service
// defaults and per-area overrides are deliberate values and are used as-is by
// the pricing engine.

/** Small epsilon so float noise (1.0000000004) doesn't bump a whole hour up. */
const EPSILON = 1e-9;

/**
 * Round a raw duration up to the billable whole hours (minimum 1).
 * Returns null for missing/zero/invalid input so callers can fall through the
 * duration ladder.
 */
export function billableHours(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return null;
  return Math.max(1, Math.ceil(raw - EPSILON));
}
