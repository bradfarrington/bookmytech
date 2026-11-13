import { fuelFamilyOf, type FuelFamily } from "@/lib/catalogue/products";
import { getCarTypeNode } from "./tree";

/**
 * The fuel of a HaynesPro car type, as the product catalogue filters by it
 * (Task 74). Memoised with the type node in tree.ts — engine oil reads the same
 * node — so it's normally free. Null when unknown: the vehicle then sees every
 * product, as before fuels existed.
 */
export async function vehicleFuelFamily(carTypeId: number): Promise<FuelFamily | null> {
  try {
    const node = await getCarTypeNode(carTypeId);
    return fuelFamilyOf(node?.fuelType ?? null);
  } catch {
    return null;
  }
}
