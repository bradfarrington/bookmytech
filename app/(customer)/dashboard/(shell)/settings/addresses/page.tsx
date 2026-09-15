import { redirect } from "next/navigation";
import { Briefcase, House, MapPin, Plus, TriangleAlert, type LucideIcon } from "lucide-react";
import {
  ButtonLink,
  Caption,
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  Screen,
  Stack,
  StatusPill,
  Tile,
} from "@/components/dashboard/ui";
import { listAddresses } from "@/lib/addresses/store";
import { ADDRESS_LIMITS, type AddressKind, type SavedAddress } from "@/lib/addresses/validate";
import { PARKING_OPTIONS } from "@/lib/bookings/parking";
import { createClient } from "@/lib/supabase/server";
import { AddressMenu } from "./_components/address-menu";

// Saved addresses (Task 48, mockup 05 "Addresses"), from lib/addresses (Task 49)
// through the caller's own client. Before migration 0072 the table is missing
// and this says so quietly.

const KIND_ICONS: Record<AddressKind, LucideIcon> = { home: House, work: Briefcase, other: MapPin };

const NEW_HREF = "/dashboard/settings/addresses/new";

function AddressCard({ address }: { address: SavedAddress }) {
  const parking = PARKING_OPTIONS.find((option) => option.value === address.parkingType)?.label ?? "Not set";
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Tile icon={KIND_ICONS[address.kind]} />
          <div className="flex min-w-0 flex-col gap-1">
            <div className="truncate text-sm font-bold leading-5 text-text-primary">{address.label}</div>
            {(address.isDefault || address.note) && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {address.isDefault && <StatusPill tone="active">Default</StatusPill>}
                {address.note && <Caption>{address.note}</Caption>}
              </div>
            )}
          </div>
        </div>
        <AddressMenu id={address.id} label={address.label} isDefault={address.isDefault} />
      </div>

      <div className="my-3 h-px bg-border-subtle" />

      <address className="text-[13px] not-italic leading-[19px] text-text-secondary">
        {address.addressLine1}
        {address.addressLine2 && (
          <>
            <br />
            {address.addressLine2}
          </>
        )}
        <br />
        {address.postcode}
      </address>
      <Caption className="mt-2">Parking: {parking}</Caption>
      {address.specialInstructions && (
        <Caption className="mt-1 line-clamp-2">{address.specialInstructions}</Caption>
      )}
    </Panel>
  );
}

export default async function AddressesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const result = await listAddresses(supabase, user.id);
  const canAdd = result.ok && result.available && result.addresses.length < ADDRESS_LIMITS.perCustomer;

  return (
    <Screen>
      <PageHeader
        title="Addresses"
        backHref="/dashboard/settings"
        backLabel="Back to settings"
        action={
          canAdd ? (
            <ButtonLink href={NEW_HREF} size="sm" icon={Plus}>
              Add
            </ButtonLink>
          ) : undefined
        }
      />

      <Stack>
        {!result.ok ? (
          <Notice tone="danger" icon={TriangleAlert} title={result.error} />
        ) : !result.available ? (
          <Notice icon={MapPin} title="Saved addresses aren't available yet.">
            Your bookings aren&apos;t affected. Please check back soon.
          </Notice>
        ) : (
          <>
            <div>
              <div className="font-display text-[26px] font-extrabold leading-8 tracking-[-0.7px] text-text-primary">
                Saved addresses
              </div>
              <p className="mt-1.5 text-sm leading-5 text-text-secondary">
                The places your car is usually parked, with parking notes for your mechanic. Pick one when you book
                instead of typing it again.
              </p>
            </div>

            {result.addresses.length === 0 ? (
              <EmptyState
                icon={MapPin}
                title="No saved addresses yet"
                body="Add your home or work address and where your car can be parked."
                action={
                  <ButtonLink href={NEW_HREF} icon={Plus}>
                    Add an address
                  </ButtonLink>
                }
              />
            ) : (
              <>
                {result.addresses.map((address) => (
                  <AddressCard key={address.id} address={address} />
                ))}
                {canAdd ? (
                  <ButtonLink href={NEW_HREF} variant="secondary" full icon={Plus}>
                    Add an address
                  </ButtonLink>
                ) : (
                  <Caption className="text-center">
                    You can save up to {ADDRESS_LIMITS.perCustomer} addresses. Remove one to add another.
                  </Caption>
                )}
              </>
            )}
          </>
        )}
      </Stack>
    </Screen>
  );
}
