import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { vehicleLabel } from "@/lib/utils";
import { ProgressStepper } from "@/components/customer/progress-stepper";
import { Button } from "@/components/ui/button";
import { quoteRepair } from "@/lib/haynespro/repair-booking";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { FUNNEL_EVENTS } from "@/lib/analytics/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { PriceHero } from "./_components/price-hero";

interface MatchPageProps {
  searchParams: Promise<{
    reg?: string;
    /** HaynesPro repair node id — what's being booked. */
    repair?: string;
    make?: string;
    model?: string;
    postcode?: string;
    /** Preferred mechanic id (rebook "same mechanic") — forwarded to /book/slot. */
    pref?: string;
  }>;
}

export default async function MatchPage({ searchParams }: MatchPageProps) {
  const params = await searchParams;
  const reg = params.reg ?? "";
  const repairNodeId = params.repair ?? "";

  if (!reg.trim() || !repairNodeId.trim()) {
    redirect("/book");
  }

  const vehicleParams = [
    params.make ? `make=${encodeURIComponent(params.make)}` : null,
    params.model ? `model=${encodeURIComponent(params.model)}` : null,
    params.postcode ? `postcode=${encodeURIComponent(params.postcode)}` : null,
  ]
    .filter(Boolean)
    .join("&");

  // Server-authoritative price from (reg, node) — the URL never carries one.
  const quote = await quoteRepair(reg, repairNodeId, createAdminClient());
  if (!quote) {
    // Vehicle no longer resolves or the node is stale — back to the browser.
    redirect(
      `/book/repairs?reg=${encodeURIComponent(reg)}${vehicleParams ? `&${vehicleParams}` : ""}`,
    );
  }

  const backHref = `/book/repairs?reg=${encodeURIComponent(reg)}${vehicleParams ? `&${vehicleParams}` : ""}`;
  const slotHref = `/book/slot?reg=${encodeURIComponent(reg)}&repair=${encodeURIComponent(repairNodeId)}${vehicleParams ? `&${vehicleParams}` : ""}${params.pref ? `&pref=${encodeURIComponent(params.pref)}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <TrackOnMount
        event={FUNNEL_EVENTS.priceViewed}
        properties={{ service: `repair:${repairNodeId}` }}
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
        serviceName={quote.description}
        pricePence={quote.breakdown.totalPence}
        description="Priced from the manufacturer's book time for your exact vehicle. Parts, if needed, are agreed with your mechanic."
        estimatedHours={quote.billedHours}
        vehicleName={[params.make, params.model].filter(Boolean).join(" ") || null}
      />

      <Link href={slotHref}>
        <Button variant="primary" size="lg" fullWidth iconRight={ChevronRight}>
          Pick a time
        </Button>
      </Link>
    </div>
  );
}
