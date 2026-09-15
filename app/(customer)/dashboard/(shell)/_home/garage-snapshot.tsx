import { Car } from "lucide-react";
import type { GarageVehicle } from "@/lib/garage/garage";
import { vehicleName } from "@/lib/dashboard/customer-bookings";
import { ListCard, ListRow, Section, TextLink } from "@/components/dashboard/ui";

const SHOWN = 3;

// Home's side-column peek at the garage. The page hides it when the garage is
// empty or not available yet.
export function GarageSnapshot({ vehicles }: { vehicles: GarageVehicle[] }) {
  if (vehicles.length === 0) return null;
  return (
    <Section title="Your garage" action={<TextLink href="/dashboard/garage">View all</TextLink>}>
      <ListCard>
        {vehicles.slice(0, SHOWN).map((vehicle) => {
          const name = vehicleName({
            vehicleMake: vehicle.make,
            vehicleModel: vehicle.model,
            vehicleReg: vehicle.displayRegistration,
          });
          const hasName = name !== vehicle.displayRegistration;
          return (
            <ListRow
              key={vehicle.id}
              href="/dashboard/garage"
              icon={Car}
              title={vehicle.nickname ?? name}
              caption={
                vehicle.nickname
                  ? [vehicle.displayRegistration, hasName ? name : null].filter(Boolean).join(" · ")
                  : hasName
                    ? vehicle.displayRegistration
                    : undefined
              }
            />
          );
        })}
      </ListCard>
    </Section>
  );
}
