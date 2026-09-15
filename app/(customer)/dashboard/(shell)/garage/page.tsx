import { redirect } from "next/navigation";
import { Car, Plus, TriangleAlert } from "lucide-react";
import { ButtonLink, Caption, EmptyState, Notice, PageHeader, Screen, Stack } from "@/components/dashboard/ui";
import { loadCustomerBookings, type CustomerBooking } from "@/lib/dashboard/customer-bookings";
import { GARAGE_LIMIT, NICKNAME_MAX, listGarage } from "@/lib/garage/garage";
import { createClient } from "@/lib/supabase/server";
import { AddVehicleForm } from "./_components/add-vehicle-form";
import { VehicleCard } from "./_components/vehicle-card";
import { lastCompletedByRegistration } from "./_lib/display";

// Your garage (Task 48, mockup 05 "Your garage"): the customer's saved vehicles
// from lib/garage (Task 50), which refreshes stale DVLA details itself. `?add=1`
// opens the inline Add form, so the header's Add button is a plain link.

export default async function GaragePage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string | string[] }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { add } = await searchParams;
  const [garage, bookings] = await Promise.all([
    listGarage(user.id),
    // Only for each vehicle's "Last job". Not worth failing the garage over.
    loadCustomerBookings({ userId: user.id, email: user.email ?? null }).catch((err: unknown): CustomerBooking[] => {
      console.error("[garage] bookings read failed", err);
      return [];
    }),
  ]);

  if (!garage.ok) {
    return (
      <Screen>
        <PageHeader title="Your garage" />
        <Notice tone="danger" icon={TriangleAlert} title={garage.error} />
      </Screen>
    );
  }

  if (!garage.available) {
    return (
      <Screen>
        <PageHeader title="Your garage" />
        <EmptyState
          icon={Car}
          title="Your garage isn't available yet"
          body="Saved vehicles are on their way. Your bookings aren't affected."
        />
      </Screen>
    );
  }

  const vehicles = garage.vehicles;
  const atLimit = vehicles.length >= GARAGE_LIMIT;
  const adding = add === "1" && !atLimit;
  const lastJobs = lastCompletedByRegistration(bookings);
  const now = new Date();

  return (
    <Screen>
      <PageHeader
        title="Your garage"
        action={
          !adding && !atLimit ? (
            <ButtonLink href="/dashboard/garage?add=1" size="sm" icon={Plus} prefetch={false}>
              Add
            </ButtonLink>
          ) : undefined
        }
      />

      <Stack>
        {vehicles.length > 0 && (
          <div>
            <div className="font-display text-[26px] font-extrabold leading-8 tracking-[-0.7px] text-text-primary">
              {vehicles.length} {vehicles.length === 1 ? "vehicle" : "vehicles"}
            </div>
            <p className="mt-1.5 text-sm leading-5 text-text-secondary">
              MOT and tax dates checked with the DVLA, so nothing creeps up on you.
            </p>
          </div>
        )}

        {adding && <AddVehicleForm nicknameMax={NICKNAME_MAX} />}

        {vehicles.length === 0 && !adding && (
          <EmptyState
            icon={Car}
            title="Your garage is empty"
            body="Add a vehicle to keep its MOT and tax dates in one place. Vehicles you book for while signed in are added for you."
            action={
              <ButtonLink href="/dashboard/garage?add=1" icon={Plus} prefetch={false}>
                Add a vehicle
              </ButtonLink>
            }
          />
        )}

        {vehicles.map((vehicle) => (
          <VehicleCard
            key={vehicle.id}
            vehicle={vehicle}
            lastJobAt={lastJobs.get(vehicle.registration) ?? null}
            nicknameMax={NICKNAME_MAX}
            now={now}
          />
        ))}

        {atLimit && (
          <Caption className="text-center">
            You can keep up to {GARAGE_LIMIT} vehicles in your garage. Remove one to add another.
          </Caption>
        )}
      </Stack>
    </Screen>
  );
}
