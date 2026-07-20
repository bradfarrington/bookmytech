import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vehicleLabel } from "@/lib/utils";
import { ProgressStepper } from "@/components/customer/progress-stepper";
import { quoteRepair } from "@/lib/haynespro/repair-booking";
import { SlotPicker } from "./_components/slot-picker";

interface SlotPageProps {
  searchParams: Promise<{
    reg?: string;
    /** HaynesPro repair node id — what's being booked. */
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
  const repairNodeId = params.repair ?? "";

  if (!reg.trim() || !repairNodeId.trim()) {
    redirect("/book");
  }

  // Re-quote server-side (never trust the URL) — the same (reg, node) inputs
  // price identically at checkout and booking create.
  const quote = await quoteRepair(reg, repairNodeId, createAdminClient());
  if (!quote) {
    redirect(`/book/repairs?reg=${encodeURIComponent(reg)}`);
  }

  const repairName = quote.description;
  const pricePence = quote.breakdown.totalPence;

  // Surface any account credit a signed-in customer has, so the picker can hint
  // it before checkout (the actual amount applied is decided server-side).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let availableCreditPence = 0;
  if (user) {
    const { availableCreditPence: getCredit } = await import("@/lib/credits/credits");
    availableCreditPence = await getCredit(createAdminClient(), user.id);
  }

  const vehicleParams = [
    params.make ? `make=${encodeURIComponent(params.make)}` : null,
    params.model ? `model=${encodeURIComponent(params.model)}` : null,
    params.postcode ? `postcode=${encodeURIComponent(params.postcode)}` : null,
  ]
    .filter(Boolean)
    .join("&");

  const backHref = `/book/match?reg=${encodeURIComponent(reg)}&repair=${encodeURIComponent(repairNodeId)}${vehicleParams ? `&${vehicleParams}` : ""}`;

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
          <p className="text-sm text-text-secondary">{repairName} · {vehicleLabel(reg, params.make, params.model)}</p>
        </div>
      </div>

      <SlotPicker
        reg={reg}
        make={(params.make ?? "").toUpperCase()}
        model={params.model}
        defaultPostcode={(params.postcode ?? "").toUpperCase()}
        repairName={repairName}
        repairNodeId={repairNodeId}
        pricePence={pricePence}
        preferredMechanicId={params.pref}
        availableCreditPence={availableCreditPence}
      />
    </div>
  );
}
