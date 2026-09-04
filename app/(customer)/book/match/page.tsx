import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Plus } from "lucide-react";
import { vehicleLabel } from "@/lib/utils";
import { ProgressStepper } from "@/components/customer/progress-stepper";
import { Button } from "@/components/ui/button";
import { quoteRepairs } from "@/lib/haynespro/repair-booking";
import {
  MAX_REPAIRS_PER_BOOKING,
  parseRepairIds,
  repairsQuery,
} from "@/lib/bookings/repair-ids";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { FUNNEL_EVENTS } from "@/lib/analytics/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { PriceHero } from "./_components/price-hero";

// Step 3: the price. One job, or several priced as one visit (Task 24) — the
// customer can add another from here and comes back with it appended. A
// combined repair (Task 26) is one chosen item that stands for several jobs.

interface MatchPageProps {
  searchParams: Promise<{
    reg?: string;
    /** The items being booked — see lib/bookings/repair-ids.ts (`repair` = legacy single). */
    repairs?: string;
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
  const ids = parseRepairIds(params);

  if (!reg.trim() || ids.length === 0) {
    redirect("/book");
  }

  const vehicleParams = [
    params.make ? `make=${encodeURIComponent(params.make)}` : null,
    params.model ? `model=${encodeURIComponent(params.model)}` : null,
    params.postcode ? `postcode=${encodeURIComponent(params.postcode)}` : null,
  ]
    .filter(Boolean)
    .join("&");
  const prefParam = params.pref ? `&pref=${encodeURIComponent(params.pref)}` : "";
  const browserHref = `/book/repairs?reg=${encodeURIComponent(reg)}${vehicleParams ? `&${vehicleParams}` : ""}${prefParam}`;

  // Server-authoritative price from (reg, items) — the URL never carries one.
  const quote = await quoteRepairs(reg, ids, createAdminClient());
  if (!quote) {
    // Vehicle no longer resolves or an item is stale/hidden — back to the browser.
    redirect(browserHref);
  }

  const withRepairs = (list: string[]) => `&${repairsQuery(list)}`;
  const slotHref = `/book/slot?reg=${encodeURIComponent(reg)}${withRepairs(quote.itemIds)}${vehicleParams ? `&${vehicleParams}` : ""}${prefParam}`;
  const addHref = `${browserHref}${withRepairs(quote.itemIds)}`;
  // Dropping an item rewrites the URL; dropping the last one is "start again".
  const removeHref = (itemId: string) => {
    const rest = quote.itemIds.filter((id) => id !== itemId);
    return rest.length
      ? `/book/match?reg=${encodeURIComponent(reg)}${withRepairs(rest)}${vehicleParams ? `&${vehicleParams}` : ""}${prefParam}`
      : browserHref;
  };
  const multiJobs = quote.lines.length > 1;
  const canAdd = quote.items.length < MAX_REPAIRS_PER_BOOKING;

  return (
    <div className="flex flex-col gap-6">
      <TrackOnMount
        event={FUNNEL_EVENTS.priceViewed}
        properties={{
          service: `repair:${quote.nodeIds[0]}`,
          repairNodeIds: quote.nodeIds,
          itemIds: quote.itemIds,
          repairCount: quote.nodeIds.length,
        }}
      />
      <ProgressStepper currentStep={3} />

      <div className="flex items-center gap-3">
        <Link
          href={quote.items.length > 1 ? addHref : browserHref}
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
        description={
          multiJobs
            ? quote.combineSource === "haynespro"
              ? "Priced as one visit from the manufacturer's book times for your exact vehicle — work that overlaps isn't charged twice."
              : "Each job priced from the manufacturer's book time for your exact vehicle, done in one visit."
            : "Priced from the manufacturer's book time for your exact vehicle."
        }
        estimatedHours={quote.billedHours}
        vehicleName={[params.make, params.model].filter(Boolean).join(" ") || null}
        lines={
          multiJobs
            ? quote.lines.map((line) => ({
                nodeId: line.nodeId,
                description: line.description,
                rawHours: line.rawHours,
                chargedHours: line.chargedHours,
                itemId: line.itemId,
                itemLabel: line.itemLabel,
                removeHref: removeHref(line.itemId),
              }))
            : undefined
        }
        combinedRawHours={multiJobs ? quote.combinedRawHours : undefined}
        combineSource={multiJobs ? quote.combineSource : null}
      />

      <div className="flex flex-col gap-3">
        <Link href={slotHref}>
          <Button variant="primary" size="lg" fullWidth iconRight={ChevronRight}>
            Pick a time
          </Button>
        </Link>
        {canAdd && (
          <Link href={addHref}>
            <Button variant="secondary" size="lg" fullWidth iconRight={Plus}>
              Add another job
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
