// Billable-hours (Task 16; owner decision 2026-07-20: bill EXACT book time).
//
// Vehicle-specific OEM book times are billed exactly as HaynesPro reports
// them, with a 1-hour minimum:
//
//   0.2 → 1   0.7 → 1   1.0 → 1   1.2 → 1.2   1.5 → 1.5   2.3 → 2.3
//
// This applies ONLY to the HaynesPro-derived duration. Admin-entered service
// defaults and per-area overrides are deliberate values and are used as-is by
// the pricing engine.

/**
 * Billable hours for a raw OEM duration: the exact time, floored at 1 hour.
 * HaynesPro times arrive as integer hundredths (value / 100), so rounding to
 * 2 dp is lossless and just strips float noise (1.0000000004 → 1).
 * Returns null for missing/zero/invalid input so callers can fall through the
 * duration ladder.
 */
export function billableHours(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return null;
  return Math.max(1, Math.round(raw * 100) / 100);
}
