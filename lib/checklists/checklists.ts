// Service checklists and pre-purchase inspection reports (Task 32). Pure —
// no I/O — so which checklist a booking carries, how far through it the
// mechanic is, and which answers are valid are all unit-tested and shared by
// the mechanic's panel, the completion gate, the customer's report and the
// admin.
//
// Gareth (2026-09-08): "I will supply a checklist for each service — a
// checkbox with checked and n/a and a box so mechanics can leave comments
// about each thing that was checked", and for the pre-purchase inspection a
// drop-down per item. His inspection sheet grades Pass / Advisory / Fail /
// Not Checked (the email said good / fair / poor / n/a — the sheet wins, it is
// the customer-facing scale).

export type ChecklistKind = "service" | "inspection";
export type ChecklistTier = "bronze" | "silver" | "gold";
export type ServiceResult = "checked" | "na";
export type InspectionResult = "pass" | "advisory" | "fail" | "not_checked";
export type ChecklistResult = ServiceResult | InspectionResult;

export const CHECKLIST_TIERS: readonly ChecklistTier[] = ["bronze", "silver", "gold"];

export const SERVICE_RESULTS: readonly { value: ServiceResult; label: string }[] = [
  { value: "checked", label: "Checked" },
  { value: "na", label: "N/A" },
];

export const INSPECTION_RESULTS: readonly { value: InspectionResult; label: string; meaning: string }[] = [
  { value: "pass", label: "Pass", meaning: "Serviceable with no significant defect found" },
  { value: "advisory", label: "Advisory", meaning: "Attention or maintenance will be needed" },
  { value: "fail", label: "Fail", meaning: "Defective, unsafe, or requires repair" },
  { value: "not_checked", label: "Not checked", meaning: "Inaccessible, unavailable, or outside the inspection scope" },
];

export function resultsForKind(kind: ChecklistKind): readonly { value: ChecklistResult; label: string }[] {
  return kind === "service" ? SERVICE_RESULTS : INSPECTION_RESULTS;
}

export function isValidResult(kind: ChecklistKind, result: string): result is ChecklistResult {
  return resultsForKind(kind).some((r) => r.value === result);
}

export function resultLabel(result: string | null | undefined): string {
  const found = [...SERVICE_RESULTS, ...INSPECTION_RESULTS].find((r) => r.value === result);
  return found?.label ?? "—";
}

// --- Rows, as the tables hold them -----------------------------------------

export interface ChecklistRow {
  id: string;
  key: string;
  name: string;
  kind: ChecklistKind;
}

export interface ChecklistItemRow {
  id: string;
  checklist_id: string;
  section: string;
  label: string;
  position: number | null;
  /** null = every tier; else the tiers the item applies to. */
  tiers: string[] | null;
  is_active: boolean;
}

export interface ChecklistResultRow {
  item_id: string;
  result: string;
  comment: string | null;
  updated_at?: string | null;
}

/** A product row's link to its checklist (catalogue_products.checklist_id / checklist_tier). */
export interface ProductChecklistLink {
  productId: string;
  checklist_id: string | null;
  checklist_tier: string | null;
}

/** One checklist a booking has to complete, at one tier. */
export interface BookingChecklist {
  checklistId: string;
  tier: ChecklistTier | null;
}

/**
 * Which checklists a booking carries: one per product line whose product has
 * one. A Full service + a Gold inspection in one visit → two; two products on
 * the same checklist → one (the higher tier wins).
 */
export function checklistsForBooking(
  productIdsInBooking: readonly string[],
  links: readonly ProductChecklistLink[],
): BookingChecklist[] {
  const rank = (t: ChecklistTier | null) => (t == null ? 3 : CHECKLIST_TIERS.indexOf(t));
  const byChecklist = new Map<string, BookingChecklist>();
  for (const productId of productIdsInBooking) {
    const link = links.find((l) => l.productId === productId);
    if (!link?.checklist_id) continue;
    const tier = CHECKLIST_TIERS.includes(link.checklist_tier as ChecklistTier)
      ? (link.checklist_tier as ChecklistTier)
      : null;
    const existing = byChecklist.get(link.checklist_id);
    if (!existing || rank(tier) > rank(existing.tier)) {
      byChecklist.set(link.checklist_id, { checklistId: link.checklist_id, tier });
    }
  }
  return [...byChecklist.values()];
}

/** The items of one checklist that apply at a tier, active only, in order. */
export function itemsForTier(
  items: readonly ChecklistItemRow[],
  checklistId: string,
  tier: ChecklistTier | null,
): ChecklistItemRow[] {
  return items
    .filter((i) => i.checklist_id === checklistId && i.is_active)
    .filter((i) => i.tiers == null || i.tiers.length === 0 || (tier != null && i.tiers.includes(tier)))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

export interface ChecklistSection {
  section: string;
  items: ChecklistItemRow[];
}

/** Items grouped by section, keeping first-seen section order. */
export function groupBySection(items: readonly ChecklistItemRow[]): ChecklistSection[] {
  const sections: ChecklistSection[] = [];
  const byName = new Map<string, ChecklistSection>();
  for (const item of items) {
    let section = byName.get(item.section);
    if (!section) {
      section = { section: item.section, items: [] };
      byName.set(item.section, section);
      sections.push(section);
    }
    section.items.push(item);
  }
  return sections;
}

export interface ChecklistProgress {
  total: number;
  answered: number;
  unanswered: number;
  /** Inspection counts; all zero on a service checklist. */
  pass: number;
  advisory: number;
  fail: number;
  notChecked: number;
  /** Service counts. */
  checked: number;
  na: number;
}

export function checklistProgress(
  items: readonly ChecklistItemRow[],
  results: readonly ChecklistResultRow[],
): ChecklistProgress {
  const byItem = new Map(results.map((r) => [r.item_id, r.result]));
  const p: ChecklistProgress = { total: items.length, answered: 0, unanswered: 0, pass: 0, advisory: 0, fail: 0, notChecked: 0, checked: 0, na: 0 };
  for (const item of items) {
    const r = byItem.get(item.id);
    if (!r) continue;
    p.answered += 1;
    if (r === "pass") p.pass += 1;
    else if (r === "advisory") p.advisory += 1;
    else if (r === "fail") p.fail += 1;
    else if (r === "not_checked") p.notChecked += 1;
    else if (r === "checked") p.checked += 1;
    else if (r === "na") p.na += 1;
  }
  p.unanswered = p.total - p.answered;
  return p;
}

/** The sentence completion is refused with, or null when the checklist is done. */
export function unfinishedMessage(name: string, progress: ChecklistProgress): string | null {
  if (progress.unanswered <= 0) return null;
  return `Finish the ${name} first — ${progress.unanswered} item${progress.unanswered === 1 ? " still needs" : "s still need"} an answer.`;
}
