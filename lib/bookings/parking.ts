// Where the mechanic can park: the four values `bookings.parking_type` and
// `customer_addresses.parking_type` hold, and how each reads to a customer.
//
// A plain module so server components can import it. lib/bookings/address-draft.ts
// re-exports these, but it also imports a React hook, which a server component
// can't load.

export type ParkingType = "driveway" | "street" | "car_park" | "other";

export const PARKING_OPTIONS: ReadonlyArray<{ value: ParkingType; label: string }> = [
  { value: "driveway", label: "Driveway" },
  { value: "street", label: "On the street" },
  { value: "car_park", label: "Car park" },
  { value: "other", label: "Other" },
];

/** "On the street", or null for a value we don't know. */
export function parkingTypeLabel(value: string | null | undefined): string | null {
  return PARKING_OPTIONS.find((option) => option.value === value)?.label ?? null;
}
