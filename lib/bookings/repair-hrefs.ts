// The links the customer's repair browser builds (Task 30 pulled them out of
// repair-browser.tsx). Pure — no "server-only" — because the search box is a
// client component and has to build the SAME hrefs for its hits as the
// server-rendered browse list does for its rows; one builder means the two
// can't drift.
//
// Every link keeps the vehicle (`reg`, `make`, `model`, `postcode`), the
// preferred mechanic (`pref`, a rebook) and the jobs already chosen
// (`repairs=`, Task 24) so nothing is lost while browsing.

import { repairsQuery } from "./repair-ids";

export interface RepairCrumb {
  id: string;
  label: string;
}

export interface RepairHrefInput {
  reg: string;
  make?: string | null;
  model?: string | null;
  postcode?: string | null;
  pref?: string | null;
  /** Items already in the booking, in order. */
  selectedIds: readonly string[];
  /** Breadcrumb trail down to the current level, root first. */
  trail?: readonly RepairCrumb[];
}

export interface RepairHrefs {
  /** The browser at the root, with the vehicle and the booking so far. */
  base: string;
  /** Drill into a group from the current level. */
  groupHref: (id: string, label: string) => string;
  /** Back up to a crumb; -1 is the root. */
  crumbHref: (index: number) => string;
  /** The price page, with this item appended to whatever is already chosen. */
  bookHref: (id: string) => string;
  /** The price page for exactly the booking so far. */
  continueHref: string;
}

/** "id~label|id~label" ⇄ crumbs. `~` and `|` never appear in HaynesPro ids. */
export function parseCrumbs(raw: string | null | undefined): RepairCrumb[] {
  if (!raw) return [];
  return raw
    .split("|")
    .filter(Boolean)
    .map((part) => {
      const [id, ...label] = part.split("~");
      return { id, label: label.join("~") };
    });
}

export function serialiseCrumbs(trail: readonly RepairCrumb[]): string {
  return trail.map((c) => `${c.id}~${c.label}`).join("|");
}

export function buildRepairHrefs(input: RepairHrefInput): RepairHrefs {
  const { reg, selectedIds } = input;
  const trail = input.trail ?? [];
  const vehicleParams = [
    input.make ? `make=${encodeURIComponent(input.make)}` : null,
    input.model ? `model=${encodeURIComponent(input.model)}` : null,
    input.postcode ? `postcode=${encodeURIComponent(input.postcode)}` : null,
    input.pref ? `pref=${encodeURIComponent(input.pref)}` : null,
  ]
    .filter(Boolean)
    .join("&");
  const vehicleSuffix = vehicleParams ? `&${vehicleParams}` : "";
  const selectedQuery = repairsQuery(selectedIds);
  const base = `/book/repairs?reg=${encodeURIComponent(reg)}${vehicleSuffix}${selectedQuery ? `&${selectedQuery}` : ""}`;

  const levelHref = (upto: readonly RepairCrumb[]) => {
    const current = upto[upto.length - 1];
    return `${base}&node=${encodeURIComponent(current.id)}&crumbs=${encodeURIComponent(serialiseCrumbs(upto))}`;
  };

  return {
    base,
    groupHref: (id, label) => levelHref([...trail, { id, label }]),
    crumbHref: (index) => (index < 0 ? base : levelHref(trail.slice(0, index + 1))),
    bookHref: (id) =>
      `/book/match?reg=${encodeURIComponent(reg)}&${repairsQuery([...selectedIds, id])}${vehicleSuffix}`,
    continueHref: `/book/match?reg=${encodeURIComponent(reg)}&${selectedQuery}${vehicleSuffix}`,
  };
}
