// Where a booking opens the repair browser when a link chose it before the reg
// was known (Task 46: the homepage's services cards and "Book a specific
// repair"). The choice rides `?node=` through /book → /book/vehicle →
// /book/repairs. Pure, so the three steps and the tests share one check.
//
// Only the top of the catalogue is accepted: HaynesPro's "Repairs" root or one
// of the product categories. Anything deeper needs the vehicle first, and an
// unknown value is dropped rather than passed on.

import { PRODUCT_CATEGORIES, REPAIRS_TOP_NODE } from "@/lib/catalogue/products";
import { serialiseCrumbs } from "./repair-hrefs";

export interface BookingStartNode {
  /** "root" or "c:<category>". */
  id: string;
  /** The breadcrumb trail for that level, serialised for `?crumbs=`. */
  crumbs: string;
}

export function bookingStartNode(raw: string | null | undefined): BookingStartNode | null {
  if (!raw) return null;
  if (raw === REPAIRS_TOP_NODE.id) {
    return { id: raw, crumbs: serialiseCrumbs([{ id: raw, label: REPAIRS_TOP_NODE.description }]) };
  }
  const category = PRODUCT_CATEGORIES.find((c) => c.id === raw);
  return category
    ? { id: category.id, crumbs: serialiseCrumbs([{ id: category.id, label: category.label }]) }
    : null;
}
