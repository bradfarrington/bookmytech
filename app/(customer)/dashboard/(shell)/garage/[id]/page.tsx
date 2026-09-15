import { notFound, redirect } from "next/navigation";
import { TriangleAlert, Wrench } from "lucide-react";
import {
  ButtonLink,
  Caption,
  DetailRow,
  ListCard,
  ListRow,
  Notice,
  PageHeader,
  Panel,
  Screen,
  Section,
  Stack,
  StatusPill,
} from "@/components/dashboard/ui";
import { bookingStatusMeta } from "@/lib/bookings/status-meta";
import { loadCustomerBookings, type CustomerBooking } from "@/lib/dashboard/customer-bookings";
import { listGarage } from "@/lib/garage/garage";
import { motAlert, normaliseRegistration } from "@/lib/garage/status";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/utils";
import { Plate } from "../_components/plate";
import { VehicleSummary } from "../_components/vehicle-card";
import {
  bookVehicleHref,
  formatDvlaDate,
  makeAndModel,
  motAlertTitle,
  motStat,
  taxStat,
  timeAgo,
  titleCaseDvla,
  vehicleTitle,
} from "../_lib/display";

// A garage vehicle's History (Task 48): its DVLA details and every booking the
// customer has made for that registration, each opening the booking.

export default async function VehicleHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const garage = await listGarage(user.id);

  if (!garage.ok) {
    return (
      <Screen>
        <PageHeader title="Vehicle history" backHref="/dashboard/garage" backLabel="Back to your garage" />
        <Notice tone="danger" icon={TriangleAlert} title={garage.error} />
      </Screen>
    );
  }

  const vehicle = garage.vehicles.find((v) => v.id === id);
  if (!vehicle) notFound();

  let bookings: CustomerBooking[] | null;
  try {
    bookings = (await loadCustomerBookings({ userId: user.id, email: user.email ?? null })).filter(
      (booking) => normaliseRegistration(booking.vehicleReg) === vehicle.registration,
    );
  } catch (err) {
    console.error("[garage] history bookings read failed", err);
    bookings = null;
  }

  const now = new Date();
  const alertTitle = motAlertTitle(motAlert(vehicle.motExpiryDate, now));
  const mot = motStat(vehicle.motExpiryDate, now);
  const tax = taxStat(vehicle.taxStatus);
  const taxDue = formatDvlaDate(vehicle.taxDueDate);
  const checked = timeAgo(vehicle.detailsCheckedAt, now);
  const bookHref = bookVehicleHref(vehicle.registration);

  return (
    <Screen>
      <PageHeader
        title={vehicleTitle(vehicle)}
        backHref="/dashboard/garage"
        backLabel="Back to your garage"
        action={
          <ButtonLink href={bookHref} size="sm" icon={Wrench}>
            Book
          </ButtonLink>
        }
      />

      <Stack>
        <Panel>
          <VehicleSummary vehicle={vehicle} now={now} />
        </Panel>

        {alertTitle && <Notice tone="warn" icon={TriangleAlert} title={alertTitle} />}

        <Section title="Details">
          <ListCard>
            <DetailRow label="Registration" value={<Plate registration={vehicle.displayRegistration} />} />
            <DetailRow label="Make and model" value={makeAndModel(vehicle) ?? "Not set"} />
            <DetailRow label="Colour" value={titleCaseDvla(vehicle.colour) ?? "Not set"} />
            <DetailRow label="Fuel" value={titleCaseDvla(vehicle.fuelType) ?? "Not set"} />
            <DetailRow label="Year" value={vehicle.yearOfManufacture ? String(vehicle.yearOfManufacture) : "Not set"} />
            <DetailRow label="MOT expires" value={mot.value} />
            <DetailRow label="Tax" value={taxDue && tax.value === "Taxed" ? `Taxed until ${taxDue}` : tax.value} />
          </ListCard>
          {checked && <Caption className="px-1">Checked with the DVLA {checked.toLowerCase()}.</Caption>}
        </Section>

        <Section title="Bookings">
          {bookings === null ? (
            <Notice tone="danger" icon={TriangleAlert} title="We couldn't load this vehicle's bookings. Please try again." />
          ) : bookings.length === 0 ? (
            <Panel className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-5 text-text-secondary">You haven&apos;t booked anything for this vehicle yet.</p>
              <ButtonLink href={bookHref} size="sm" variant="secondary" icon={Wrench}>
                Book a mechanic
              </ButtonLink>
            </Panel>
          ) : (
            <ListCard>
              {bookings.map((booking) => {
                const meta = bookingStatusMeta(booking.status);
                return (
                  <ListRow
                    key={booking.id}
                    href={`/dashboard/bookings/${booking.id}`}
                    icon={Wrench}
                    title={booking.repairDescription}
                    caption={`${booking.whenLabel} · ${formatPrice(booking.totalPence)}`}
                    trailing={meta ? <StatusPill tone={meta.tone}>{meta.label}</StatusPill> : undefined}
                    chevron
                  />
                );
              })}
            </ListCard>
          )}
        </Section>
      </Stack>
    </Screen>
  );
}
