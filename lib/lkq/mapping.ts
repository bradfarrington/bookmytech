// The bridge between the two suppliers' product taxonomies (Task 42).
//
// AAG prices by TecDoc GenArt id. LKQ prices by its own ADS component number.
// They are UNRELATED numbering systems: a brake disc is GenArt 82 to AAG and
// 000027 to LKQ; a brake pad is 402 and 000036. There is no arithmetic
// relationship to exploit, so the two can only be compared through a mapping.
//
// This is a hand-curated SEED, not data. It exists because:
//   - `TecDocReferences` on the ADS API might automate it, but is UNTESTED and
//     testing it costs a metered credit (docs/06-lkq-parts-api.md §8 Q2);
//   - matching by name needs judgement, not string equality. GenArt 479
//     "clutch" has four plausible LKQ counterparts (Clutch Cable, Clutch Kit,
//     Clutch Cover, Clutch Friction Plate) and only one is right.
//
// `confidence` is therefore part of the contract and is SHOWN IN THE UI. An
// "assumed" pairing means the two columns may not be describing the same thing,
// and a price comparison across them is indicative rather than like-for-like.
// Hiding that would make the comparison look more authoritative than it is.
//
// componentName is stored so a rename on LKQ's side fails a test rather than
// silently pricing the wrong part.

export interface PartGroupMapping {
  /** Stable id passed between the form, the action and the URL. */
  key: string;
  label: string;
  /** AAG TecDoc product group. Null when we have no counterpart. */
  genart: string | null;
  /** LKQ ADS component number. Null when we have no counterpart. */
  component: string | null;
  /** Verbatim from the ADS component list, asserted by mapping.test.ts. */
  componentName: string | null;
  confidence: "verified" | "assumed";
  note?: string;
}

export const PART_GROUPS: readonly PartGroupMapping[] = [
  {
    key: "brake-discs",
    label: "Brake discs",
    genart: "82",
    component: "000027",
    componentName: "Brake Disc",
    confidence: "verified",
  },
  {
    key: "brake-pads",
    label: "Brake pads",
    genart: "402",
    component: "000036",
    componentName: "Brake Pad",
    confidence: "verified",
  },
  {
    key: "air-filter",
    label: "Air filter",
    genart: "8",
    component: "000008",
    componentName: "Air Filter",
    confidence: "verified",
  },
  {
    key: "brake-fluid",
    label: "Brake fluid",
    genart: "3357",
    component: "000989",
    componentName: "Brake Fluid",
    confidence: "verified",
  },
  {
    key: "battery",
    label: "Battery",
    genart: "1",
    component: "000020",
    componentName: "Battery",
    confidence: "verified",
  },
  {
    key: "cambelt",
    label: "Cambelt",
    genart: "307",
    component: "000336",
    componentName: "Timing Belt",
    confidence: "verified",
  },
  {
    key: "wishbone",
    label: "Wishbone / control arm",
    genart: "273",
    component: "000437",
    componentName: "Control Arm / Wishbone Bush",
    confidence: "assumed",
    note: "LKQ's entry is the bush, AAG's GenArt is the arm — the two columns may list different parts.",
  },
  {
    key: "clutch",
    label: "Clutch kit",
    genart: "479",
    component: "000069",
    componentName: "Clutch Kit",
    confidence: "assumed",
    note: "LKQ also lists Clutch Cable, Clutch Cover and Clutch Friction Plate separately.",
  },
];

export function groupByKey(key: string): PartGroupMapping | null {
  return PART_GROUPS.find((g) => g.key === key) ?? null;
}

export function componentForGenart(genart: string): string | null {
  return PART_GROUPS.find((g) => g.genart === String(genart))?.component ?? null;
}

export function genartForComponent(component: string): string | null {
  return PART_GROUPS.find((g) => g.component === String(component))?.genart ?? null;
}

/**
 * A group for a raw component number the curated list doesn't cover. AAG cannot
 * be asked about it, so `genart` is null and the AAG column renders "not mapped"
 * rather than pretending it had nothing to sell.
 */
export function adHocGroup(component: string, componentName: string): PartGroupMapping {
  return {
    key: `component:${component}`,
    label: componentName,
    genart: null,
    component,
    componentName,
    confidence: "verified",
  };
}
