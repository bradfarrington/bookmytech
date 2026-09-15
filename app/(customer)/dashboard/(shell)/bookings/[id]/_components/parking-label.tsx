import { parkingTypeLabel } from "@/lib/bookings/parking";

// "Driveway", "On the street" and so on. lib/bookings/parking.ts is a plain
// module, so this renders on the server.
export function ParkingLabel({ value }: { value: string }) {
  return <>{parkingTypeLabel(value) ?? "Other"}</>;
}
