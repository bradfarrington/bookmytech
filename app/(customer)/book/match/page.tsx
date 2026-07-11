import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { vehicleLabel } from "@/lib/utils";
import { ProgressStepper } from "@/components/customer/progress-stepper";
import { Button } from "@/components/ui/button";
import { calculatePrice } from "@/lib/pricing/calculate";
import { quoteRepair } from "@/lib/haynespro/repair-booking";
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
    /** HaynesPro repair node id — a one-off repair booking (Task 16 Stage G). */
    repair?: string;
    make?: string;
    model?: string;
    postcode?: string;
  }>;
}

export default async function MatchPage({ searchParams }: MatchPageProps) {
  const params = await searchParams;
  const reg = params.reg ?? "";
  const serviceSlug = params.service ?? "";
  const repairNodeId = params.repair ?? "";

  if ((!reg.trim() && !params.make) || (!serviceSlug.trim() && !repairNodeId.trim())) {
    redirect("/book");
  }

  const vehicleParams = [
    params.make ? `make=${encodeURIComponent(params.make)}` : null,
    params.model ? `model=${encodeURIComponent(params.model)}` : null,
    params.postcode ? `postcode=${encodeURIComponent(params.postcode)}` : null,
  ]
    .filter(Boolean)
    .join("&");

  // What we price + display: a packaged service, or a single HaynesPro repair
  // priced from the OEM book time for this exact reg.
  let displayName: string;
  let description: string | null;
  let totalPence: number;
  let estimatedHours: number | null;
  let partLines: PartLine[] = [];
  let backHref: string;
  let slotHref: string;
  let trackedService: string;

  if (repairNodeId.trim()) {
    const quote = await quoteRepair(reg, repairNodeId, createAdminClient());
    if (!quote) {
      // Vehicle no longer resolves or the node is stale — back to the browser.
      redirect(
        `/book/service?reg=${encodeURIComponent(reg)}${vehicleParams ? `&${vehicleParams}` : ""}&view=repairs`,
      );
    }
    displayName = quote.description;
    description =
      "One-off repair for your vehicle, priced from the manufacturer's book time. Parts, if needed, are agreed with your mechanic.";
    totalPence = quote.breakdown.totalPence;
    estimatedHours = quote.billedHours;
    backHref = `/book/service?reg=${encodeURIComponent(reg)}${vehicleParams ? `&${vehicleParams}` : ""}&view=repairs`;
    slotHref = `/book/slot?reg=${encodeURIComponent(reg)}&repair=${encodeURIComponent(repairNodeId)}${vehicleParams ? `&${vehicleParams}` : ""}`;
    trackedService = `repair:${repairNodeId}`;
  } else {
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
    // step re-prices once the customer confirms their postcode. The reg lets
    // the engine try the HaynesPro book time for the actual vehicle (Task 16).
    const price = await calculatePrice(service.id, params.postcode ?? "", undefined, { reg });

    // Configured parts for itemisation. Read via the service-role client because
    // `parts`/`service_parts` are admin-only under RLS and the booker is a guest.
    // Only the BMT (sale) price is passed to the client — never supplier cost.
    const configuredParts = await getConfiguredParts(service.id, createAdminClient());
    partLines = configuredParts.map((p) => ({
      name: p.name,
      quantity: p.quantity,
      unitPricePence: p.unitPricePence,
      totalPence: p.totalPence,
    }));

    displayName = service.name;
    description = service.description;
    totalPence = price.totalPence;
    estimatedHours = price.durationSource === "vehicle" ? price.durationHours : null;
    backHref = `/book/service?reg=${encodeURIComponent(reg)}${vehicleParams ? `&${vehicleParams}` : ""}`;
    slotHref = `/book/slot?reg=${encodeURIComponent(reg)}&service=${encodeURIComponent(serviceSlug)}${vehicleParams ? `&${vehicleParams}` : ""}`;
    trackedService = serviceSlug;
  }

  const partsPence = partLines.reduce((s, p) => s + p.totalPence, 0);
  const labourPence = totalPence - partsPence;

  return (
    <div className="flex flex-col gap-6">
      <TrackOnMount
        event={FUNNEL_EVENTS.priceViewed}
        properties={{ service: trackedService }}
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
          <p className="text-sm text-text-secondary">{vehicleLabel(reg, params.make, params.model)}</p>
        </div>
      </div>

      <PriceHero
        serviceName={displayName}
        pricePence={totalPence}
        description={description}
        estimatedHours={estimatedHours}
        vehicleName={[params.make, params.model].filter(Boolean).join(" ") || null}
      />

      <PartsSection
        parts={partLines}
        labourPence={labourPence}
        totalPence={totalPence}
      />

      <Link href={slotHref}>
        <Button variant="primary" size="lg" fullWidth iconRight={ChevronRight}>
          Pick a time
        </Button>
      </Link>
    </div>
  );
}
