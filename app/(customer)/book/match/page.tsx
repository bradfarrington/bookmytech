import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ProgressStepper } from "@/components/customer/progress-stepper";
import { Button } from "@/components/ui/button";
import { calculatePrice } from "@/lib/pricing/calculate";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { FUNNEL_EVENTS } from "@/lib/analytics/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConfiguredParts } from "@/lib/parts/service-parts";
import { PriceHero } from "./_components/price-hero";
import { PartsSection, type PartLine } from "./_components/parts-section";

interface MatchPageProps {
  searchParams: Promise<{
    reg?: string;
    service?: string;
    make?: string;
    model?: string;
    postcode?: string;
  }>;
}

export default async function MatchPage({ searchParams }: MatchPageProps) {
  const params = await searchParams;
  const reg = params.reg ?? "";
  const serviceSlug = params.service ?? "";

  if (!reg.trim() || !serviceSlug.trim()) {
    redirect("/book");
  }

  const supabase = await createClient();
  const { data: service } = await supabase
    .from("services")
    .select("id, name, slug, starting_price_pence, description")
    .eq("slug", serviceSlug)
    .eq("is_active", true)
    .single();

  if (!service) notFound();

  // Price via the engine (area multiplier + parts + commission). With no
  // postcode yet the engine falls back to the Default area (×1.00); the slot
  // step re-prices once the customer confirms their postcode.
  const price = await calculatePrice(service.id, params.postcode ?? "");

  // Configured parts for itemisation. Read via the service-role client because
  // `parts`/`service_parts` are admin-only under RLS and the booker is a guest.
  // Only the BMT (sale) price is passed to the client — never supplier cost.
  const configuredParts = await getConfiguredParts(service.id, createAdminClient());
  const partLines: PartLine[] = configuredParts.map((p) => ({
    name: p.name,
    quantity: p.quantity,
    unitPricePence: p.unitPricePence,
    totalPence: p.totalPence,
  }));
  const partsPence = partLines.reduce((s, p) => s + p.totalPence, 0);
  const labourPence = price.totalPence - partsPence;

  const vehicleParams = [
    params.make ? `make=${encodeURIComponent(params.make)}` : null,
    params.model ? `model=${encodeURIComponent(params.model)}` : null,
    params.postcode ? `postcode=${encodeURIComponent(params.postcode)}` : null,
  ]
    .filter(Boolean)
    .join("&");

  const backHref = `/book/service?reg=${encodeURIComponent(reg)}${vehicleParams ? `&${vehicleParams}` : ""}`;
  const slotHref = `/book/slot?reg=${encodeURIComponent(reg)}&service=${encodeURIComponent(serviceSlug)}${vehicleParams ? `&${vehicleParams}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <TrackOnMount
        event={FUNNEL_EVENTS.priceViewed}
        properties={{ service: serviceSlug }}
      />
      <ProgressStepper currentStep={3} />

      <div className="flex items-center gap-3">
        <Link
          href={backHref}
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-text-secondary hover:bg-surface"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Your price</h1>
          <p className="text-sm text-text-secondary">{reg}</p>
        </div>
      </div>

      <PriceHero
        serviceName={service.name}
        pricePence={price.totalPence}
        description={service.description}
      />

      <PartsSection
        parts={partLines}
        labourPence={labourPence}
        totalPence={price.totalPence}
      />

      <Link href={slotHref}>
        <Button variant="primary" size="lg" fullWidth iconRight={ChevronRight}>
          Pick a time
        </Button>
      </Link>
    </div>
  );
}
