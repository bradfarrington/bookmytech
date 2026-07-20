import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { vehicleLabel } from "@/lib/utils";
import { ProgressStepper } from "@/components/customer/progress-stepper";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { FUNNEL_EVENTS } from "@/lib/analytics/events";
import { RepairBrowser } from "./_components/repair-browser";

// Step 2 of the funnel: browse the HaynesPro repair-times tree for THIS car
// and pick the repair to book. Every booking is a repair priced from the OEM
// book time — there is no packaged-services catalogue any more.

interface RepairsPageProps {
  searchParams: Promise<{
    reg?: string;
    make?: string;
    model?: string;
    postcode?: string;
    node?: string;
    crumbs?: string;
  }>;
}

export default async function RepairsPage({ searchParams }: RepairsPageProps) {
  const params = await searchParams;
  const reg = params.reg ?? "";

  if (!reg.trim()) {
    redirect("/book");
  }

  const vehicleParams = [
    params.make ? `make=${encodeURIComponent(params.make)}` : null,
    params.model ? `model=${encodeURIComponent(params.model)}` : null,
    params.postcode ? `postcode=${encodeURIComponent(params.postcode)}` : null,
  ]
    .filter(Boolean)
    .join("&");

  const backHref = `/book/vehicle?reg=${encodeURIComponent(reg)}${vehicleParams ? `&${vehicleParams}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      {/* The funnel's "service_selected" step now marks reaching the repair
          picker (the old services grid fired it per card click). */}
      <TrackOnMount event={FUNNEL_EVENTS.serviceSelected} properties={{ reg }} />
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

      <RepairBrowser
        reg={reg}
        make={params.make}
        model={params.model}
        postcode={params.postcode}
        nodeId={params.node}
        crumbs={params.crumbs}
      />
    </div>
  );
}
