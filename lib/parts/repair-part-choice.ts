// Which part a repair uses on one engine variant (Task 45).
//
// The default is the dearest part either supplier will sell us for that part
// group on that vehicle (owner decision, 2026-09-14). An admin can change it
// on the vehicle's model page; the choice is stored per engine variant +
// repair + part group (`repair_part_choices`, migration 0067) as the part's
// identity — supplier and part number — never its price, so the price is
// always today's.
//
// If the chosen part isn't in today's results (withdrawn, out of the
// supplier's catalogue, or that supplier didn't answer), the dearest is used
// and the missing choice is reported rather than silently forgotten.
//
// Pure: no I/O.

import { dearestOffer, type SupplierId, type SupplierOffer, type SupplierPanel } from "./supplier-offer";

/** A row of `repair_part_choices` (migration 0067). */
export interface RepairPartChoiceRow {
  car_type_id: number;
  node_id: string;
  genart_id: number;
  supplier: SupplierId;
  part_number: string;
  brand: string | null;
  description: string | null;
  chosen_at: string;
}

export type MissingChoice = Pick<RepairPartChoiceRow, "supplier" | "part_number" | "brand" | "description">;

export type PartSelection =
  /** The admin's chosen part, found in today's results. */
  | { source: "choice"; offer: SupplierOffer }
  /** No usable choice, so the dearest buyable part. */
  | { source: "dearest"; offer: SupplierOffer; missingChoice: MissingChoice | null }
  /** Nothing buyable came back from either supplier. */
  | { source: "none"; missingChoice: MissingChoice | null };

/** Every offer from the panels that answered. */
export function offersFrom(panels: readonly SupplierPanel[]): SupplierOffer[] {
  return panels.flatMap((panel) => (panel.state === "ok" ? panel.offers : []));
}

export function selectRepairPart(
  panels: readonly SupplierPanel[],
  choice: Pick<RepairPartChoiceRow, "supplier" | "part_number" | "brand" | "description"> | null,
): PartSelection {
  const offers = offersFrom(panels);
  if (choice) {
    const chosen = offers.find((o) => o.supplier === choice.supplier && o.partNumber === choice.part_number);
    if (chosen) return { source: "choice", offer: chosen };
  }
  const missingChoice: MissingChoice | null = choice
    ? {
        supplier: choice.supplier,
        part_number: choice.part_number,
        brand: choice.brand,
        description: choice.description,
      }
    : null;
  const dearest = dearestOffer(offers);
  return dearest ? { source: "dearest", offer: dearest, missingChoice } : { source: "none", missingChoice };
}
