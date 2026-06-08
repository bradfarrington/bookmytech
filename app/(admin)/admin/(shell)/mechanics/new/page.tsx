import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Overline } from "@/components/ui/overline";
import {
  MechanicForm,
  type ServiceOption,
} from "../_components/mechanic-form";

export default async function NewMechanicPage() {
  const supabase = await createClient();
  const { data: services } = await supabase
    .from("services")
    .select("slug, name")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  const serviceOptions: ServiceOption[] = (services ?? []) as ServiceOption[];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/admin/mechanics">
        <Button variant="ghost" size="sm" iconLeft={ArrowLeft}>
          Back to mechanics
        </Button>
      </Link>

      <header>
        <Overline>Network</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
          Add mechanic
        </h1>
        <p className="mt-1.5 text-sm text-text-muted">
          Manually create a mechanic profile. They&apos;ll receive an email
          invite with a magic-link sign-in. For self-serve sign-ups, mechanics
          can also apply and upload documents via the public application.
        </p>
      </header>

      <MechanicForm services={serviceOptions} />
    </div>
  );
}
