import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vehicleLabel } from "@/lib/utils";
import { ProgressStepper } from "@/components/customer/progress-stepper";
import { calculatePrice } from "@/lib/pricing/calculate";
import {
  quoteRepair,
  repairContainerServiceId,
} from "@/lib/haynespro/repair-booking";
import { SlotPicker } from "./_components/slot-picker";

interface SlotPageProps {
  searchParams: Promise<{
    reg?: string;
    service?: string;
    /** HaynesPro repair node id — a one-off repair booking (Task 16 Stage G). */
    repair?: string;
    make?: string;
    model?: string;
    postcode?: string;
    pref?: string;
  }>;
}

export default async function SlotPage({ searchParams }: SlotPageProps) {
  const params = await searchParams;
  const reg = params.reg ?? "";
  const serviceSlug = params.service ?? "";
  const repairNodeId = params.repair ?? "";

  if ((!reg.trim() && !params.make) || (!serviceSlug.trim() && !repairNodeId.trim())) {
    redirect("/book");
  }

  let serviceId: string;
  let serviceName: string;
  let pricePence: number;

  if (repairNodeId.trim()) {
    // One-off repair: re-quote server-side (never trust the URL) and attach
    // the booking to the hidden container service (migration 0038).
    const admin = createAdminClient();
    const [quote, containerId] = await Promise.all([
      quoteRepair(reg, repairNodeId, admin),
      repairContainerServiceId(admin),
    ]);
    if (!quote || !containerId) {
      redirect(`/book/service?reg=${encodeURIComponent(reg)}&view=repairs`);
    }
    serviceId = containerId;
    serviceName = quote.description;
    pricePence = quote.breakdown.totalPence;
  } else {
    const supabase = await createClient();
    const { data: service } = await supabase
      .from("services")
      .select("id, name, slug, starting_price_pence")
      .eq("slug", serviceSlug)
      .eq("is_active", true)
      .single();

    if (!service) notFound();

    // Initial estimate from the URL postcode; the picker re-prices for real when
    // the customer confirms their postcode and checkout is prepared. The reg lets
    // the engine try the HaynesPro book time for the actual vehicle (Task 16).
    const price = await calculatePrice(service.id, params.postcode ?? "", undefined, { reg });
    serviceId = service.id;
    serviceName = service.name;
    pricePence = price.totalPence;
  }

  // Surface any account credit a signed-in customer has, so the picker can hint
  // it before checkout (the actual amount applied is decided server-side).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let availableCreditPence = 0;
  if (user) {
    const { availableCreditPence: getCredit } = await import("@/lib/credits/credits");
    const { createAdminClient: mk } = await import("@/lib/supabase/admin");
    availableCreditPence = await getCredit(mk(), user.id);
  }

  const vehicleParams = [
    params.make ? `make=${encodeURIComponent(params.make)}` : null,
    params.model ? `model=${encodeURIComponent(params.model)}` : null,
    params.postcode ? `postcode=${encodeURIComponent(params.postcode)}` : null,
  ]
    .filter(Boolean)
    .join("&");

  const backHref = repairNodeId.trim()
    ? `/book/match?reg=${encodeURIComponent(reg)}&repair=${encodeURIComponent(repairNodeId)}${vehicleParams ? `&${vehicleParams}` : ""}`
    : `/book/match?reg=${encodeURIComponent(reg)}&service=${encodeURIComponent(serviceSlug)}${vehicleParams ? `&${vehicleParams}` : ""}`;

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
          <p className="text-sm text-text-secondary">{serviceName} · {vehicleLabel(reg, params.make, params.model)}</p>
        </div>
      </div>

      <SlotPicker
        reg={reg}
        make={(params.make ?? "").toUpperCase()}
        model={params.model}
        defaultPostcode={(params.postcode ?? "").toUpperCase()}
        serviceName={serviceName}
        serviceId={serviceId}
        repairNodeId={repairNodeId.trim() || undefined}
        pricePence={pricePence}
        preferredMechanicId={params.pref}
        availableCreditPence={availableCreditPence}
      />
    </div>
  );
}
