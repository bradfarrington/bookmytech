import { redirect } from "next/navigation";
import { MapPin, TriangleAlert } from "lucide-react";
import { Notice, PageHeader, Screen } from "@/components/dashboard/ui";
import { listAddresses } from "@/lib/addresses/store";
import { ADDRESS_LIMITS } from "@/lib/addresses/validate";
import { createClient } from "@/lib/supabase/server";
import { AddressForm } from "../_components/address-form";

// Add a saved address (Task 48, Task 49).

export default async function NewAddressPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const result = await listAddresses(supabase);

  return (
    <Screen>
      <PageHeader title="Add an address" backHref="/dashboard/settings/addresses" backLabel="Back to addresses" />
      {!result.ok ? (
        <Notice tone="danger" icon={TriangleAlert} title={result.error} />
      ) : !result.available ? (
        <Notice icon={MapPin} title="Saved addresses aren't available yet.">
          Your bookings aren&apos;t affected. Please check back soon.
        </Notice>
      ) : result.addresses.length >= ADDRESS_LIMITS.perCustomer ? (
        <Notice tone="warn" icon={MapPin} title={`You can save up to ${ADDRESS_LIMITS.perCustomer} addresses.`}>
          Remove one to add another.
        </Notice>
      ) : (
        <AddressForm address={null} isFirst={result.addresses.length === 0} />
      )}
    </Screen>
  );
}
