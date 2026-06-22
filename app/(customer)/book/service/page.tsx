import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { vehicleLabel } from "@/lib/utils";
import { ProgressStepper } from "@/components/customer/progress-stepper";
import { ServiceGrid } from "./_components/service-grid";

interface ServicePageProps {
  searchParams: Promise<{
    reg?: string;
    make?: string;
    model?: string;
    postcode?: string;
  }>;
}

export default async function ServicePage({ searchParams }: ServicePageProps) {
  const params = await searchParams;
  const reg = params.reg ?? "";

  if (!reg.trim() && !params.make) {
    redirect("/book");
  }

  const supabase = await createClient();
  const { data: services } = await supabase
    .from("services")
    .select("id, name, slug, starting_price_pence, description")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  const backHref = `/book/vehicle?reg=${encodeURIComponent(reg)}${params.make ? `&make=${encodeURIComponent(params.make)}` : ""}${params.model ? `&model=${encodeURIComponent(params.model)}` : ""}${params.postcode ? `&postcode=${encodeURIComponent(params.postcode)}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <ProgressStepper currentStep={2} />

      <div className="flex items-center gap-3">
        <Link
          href={backHref}
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-text-secondary hover:bg-surface"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">What do you need?</h1>
          <p className="text-sm text-text-secondary">{vehicleLabel(reg, params.make, params.model)}</p>
        </div>
      </div>

      <ServiceGrid
        services={services ?? []}
        reg={reg}
        make={params.make}
        model={params.model}
        postcode={params.postcode}
      />
    </div>
  );
}
