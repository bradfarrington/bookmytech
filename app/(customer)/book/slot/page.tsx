import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ProgressStepper } from "@/components/customer/progress-stepper";
import { SlotPicker } from "./_components/slot-picker";

interface SlotPageProps {
  searchParams: Promise<{
    reg?: string;
    service?: string;
    make?: string;
    model?: string;
  }>;
}

export default async function SlotPage({ searchParams }: SlotPageProps) {
  const params = await searchParams;
  const reg = params.reg ?? "";
  const serviceSlug = params.service ?? "";

  if (!reg.trim() || !serviceSlug.trim()) {
    redirect("/book");
  }

  const supabase = await createClient();
  const { data: service } = await supabase
    .from("services")
    .select("id, name, slug, starting_price_pence")
    .eq("slug", serviceSlug)
    .eq("is_active", true)
    .single();

  if (!service) notFound();

  const vehicleParams = [
    params.make ? `make=${encodeURIComponent(params.make)}` : null,
    params.model ? `model=${encodeURIComponent(params.model)}` : null,
  ]
    .filter(Boolean)
    .join("&");

  const backHref = `/book/match?reg=${encodeURIComponent(reg)}&service=${encodeURIComponent(serviceSlug)}${vehicleParams ? `&${vehicleParams}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <ProgressStepper currentStep={4} />

      <div className="flex items-center gap-3">
        <Link
          href={backHref}
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-text-secondary hover:bg-surface"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Pick a time</h1>
          <p className="text-sm text-text-secondary">{service.name} · {reg}</p>
        </div>
      </div>

      <SlotPicker
        reg={reg}
        make={(params.make ?? "").toUpperCase()}
        model={params.model}
        serviceName={service.name}
        serviceId={service.id}
        pricePence={service.starting_price_pence}
      />
    </div>
  );
}
