// Mechanic specialisms — a static list since the services catalogue was
// removed (Task 17). Purely informational: shown on applications, mechanic
// profiles and the availability page as vetting/profile context. Dispatch does
// NOT filter on specialisms — every repair booking broadcasts to every
// mechanic in range.
//
// Slugs match the old services catalogue so specialisms mechanics picked
// before the removal still resolve to the same labels.

export interface Specialism {
  slug: string;
  name: string;
}

export const SPECIALISMS: Specialism[] = [
  { slug: "full-service", name: "Full Service" },
  { slug: "diagnostic", name: "Diagnostic" },
  { slug: "front-brake-pads", name: "Front Brake Pads" },
  { slug: "battery-replacement", name: "Battery Replacement" },
  { slug: "clutch-replacement", name: "Clutch Replacement" },
  { slug: "mot-precheck", name: "MOT Pre-check" },
  { slug: "interim-service", name: "Interim Service" },
  { slug: "front-brake-discs-pads", name: "Front Brake Discs & Pads" },
  { slug: "cambelt-replacement", name: "Cambelt Replacement" },
  { slug: "air-con-regas", name: "Air-Con Regas" },
];

/** Display label for a stored specialism slug (falls back to the slug). */
export function specialismName(slug: string): string {
  return SPECIALISMS.find((s) => s.slug === slug)?.name ?? slug;
}
