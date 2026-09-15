import { notFound, redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { Notice, PageHeader, Screen } from "@/components/dashboard/ui";
import { listAddresses } from "@/lib/addresses/store";
import { createClient } from "@/lib/supabase/server";
import { AddressForm } from "../_components/address-form";

// Edit one of the caller's saved addresses (Task 48, Task 49). Found in their
// own list (RLS), so an id from the URL only ever opens one of theirs.

export default async function EditAddressPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const result = await listAddresses(supabase);

  if (!result.ok) {
    return (
      <Screen>
        <PageHeader title="Edit address" backHref="/dashboard/settings/addresses" backLabel="Back to addresses" />
        <Notice tone="danger" icon={TriangleAlert} title={result.error} />
      </Screen>
    );
  }

  const address = result.addresses.find((a) => a.id === id);
  if (!address) notFound();

  return (
    <Screen>
      <PageHeader title="Edit address" backHref="/dashboard/settings/addresses" backLabel="Back to addresses" />
      <AddressForm address={address} />
    </Screen>
  );
}
