// Estimated on-site job duration, keyed by service slug. Powers the
// "Estimated time" info tile on the mechanic job-detail view (brief section 4:
// "45–90 min by service"). Coarse on purpose — a planning hint, not an SLA.
//
// Slugs match the seed in 0001_seed_services.sql. Anything unmapped falls back
// to the generic 45–90 min range.

interface DurationEstimate {
  minMinutes: number;
  maxMinutes: number;
}

const BY_SLUG: Record<string, DurationEstimate> = {
  diagnostic: { minMinutes: 30, maxMinutes: 60 },
  "mot-precheck": { minMinutes: 30, maxMinutes: 45 },
  mot: { minMinutes: 45, maxMinutes: 60 },
  battery: { minMinutes: 30, maxMinutes: 45 },
  "battery-replacement": { minMinutes: 30, maxMinutes: 45 },
  "air-con-regas": { minMinutes: 45, maxMinutes: 60 },
  "front-brake-pads": { minMinutes: 45, maxMinutes: 75 },
  "front-brake-discs-pads": { minMinutes: 60, maxMinutes: 90 },
  brakes: { minMinutes: 60, maxMinutes: 90 },
  "interim-service": { minMinutes: 60, maxMinutes: 90 },
  service: { minMinutes: 60, maxMinutes: 90 },
  "full-service": { minMinutes: 90, maxMinutes: 150 },
  "cambelt-replacement": { minMinutes: 180, maxMinutes: 300 },
  clutch: { minMinutes: 240, maxMinutes: 360 },
  "clutch-replacement": { minMinutes: 240, maxMinutes: 360 },
};

const DEFAULT: DurationEstimate = { minMinutes: 45, maxMinutes: 90 };

export function estimatedDuration(slug: string | null | undefined): DurationEstimate {
  return (slug && BY_SLUG[slug]) || DEFAULT;
}

/** Human label, e.g. "45–90 min" or "3–5 hrs". */
export function estimatedDurationLabel(slug: string | null | undefined): string {
  const { minMinutes, maxMinutes } = estimatedDuration(slug);
  if (maxMinutes >= 120) {
    const lo = +(minMinutes / 60).toFixed(1);
    const hi = +(maxMinutes / 60).toFixed(1);
    return `${lo}–${hi} hrs`;
  }
  return `${minMinutes}–${maxMinutes} min`;
}
