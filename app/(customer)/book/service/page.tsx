import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn, vehicleLabel } from "@/lib/utils";
import { isHaynesProConfigured } from "@/lib/haynespro/client";
import { excludedServiceIdsForReg } from "@/lib/haynespro/exclusions";
import { ProgressStepper } from "@/components/customer/progress-stepper";
import { RepairBrowser } from "./_components/repair-browser";
import { ServiceGrid } from "./_components/service-grid";

interface ServicePageProps {
  searchParams: Promise<{
    reg?: string;
    make?: string;
    model?: string;
    postcode?: string;
    /** "services" (default) | "repairs" — the per-car HaynesPro repair tree. */
    view?: string;
    node?: string;
    crumbs?: string;
  }>;
}

export default async function ServicePage({ searchParams }: ServicePageProps) {
  const params = await searchParams;
  const reg = params.reg ?? "";

  if (!reg.trim() && !params.make) {
    redirect("/book");
  }

  // The Repairs tab needs a resolvable reg + HaynesPro configured.
  const repairsAvailable = Boolean(reg.trim()) && isHaynesProConfigured();
  const view = repairsAvailable && params.view === "repairs" ? "repairs" : "services";

  const supabase = await createClient();
  const { data: services } = await supabase
    .from("services")
    .select("id, name, slug, starting_price_pence, description")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  // Per-vehicle availability (Task 16): hide services the admin switched off
  // for this model. Everything defaults to available — an unresolvable reg or
  // any HaynesPro hiccup hides nothing, so the grid never shrinks by accident.
  let availableServices = services ?? [];
  if (view === "services" && reg.trim() && isHaynesProConfigured()) {
    const excluded = await excludedServiceIdsForReg(reg, createAdminClient());
    if (excluded.size > 0) {
      availableServices = availableServices.filter((s) => !excluded.has(s.id));
    }
  }

  const vehicleParams = [
    params.make ? `make=${encodeURIComponent(params.make)}` : null,
    params.model ? `model=${encodeURIComponent(params.model)}` : null,
    params.postcode ? `postcode=${encodeURIComponent(params.postcode)}` : null,
  ]
    .filter(Boolean)
    .join("&");

  const backHref = `/book/vehicle?reg=${encodeURIComponent(reg)}${vehicleParams ? `&${vehicleParams}` : ""}`;
  const tabHref = (v: "services" | "repairs") =>
    `/book/service?reg=${encodeURIComponent(reg)}${vehicleParams ? `&${vehicleParams}` : ""}${v === "repairs" ? "&view=repairs" : ""}`;

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

      {/* Our packaged services vs. the per-car HaynesPro repair list */}
      {repairsAvailable && (
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface p-1">
          {(
            [
              ["services", "Our services"],
              ["repairs", "Repairs for your car"],
            ] as const
          ).map(([key, label]) => (
            <Link
              key={key}
              href={tabHref(key)}
              className={cn(
                "rounded-lg px-3 py-2.5 text-center text-sm font-semibold transition-colors",
                view === key
                  ? "bg-surface-card text-brand-blue shadow-card"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      )}

      {view === "repairs" ? (
        <RepairBrowser
          reg={reg}
          make={params.make}
          model={params.model}
          postcode={params.postcode}
          nodeId={params.node}
          crumbs={params.crumbs}
        />
      ) : (
        <ServiceGrid
          services={availableServices}
          reg={reg}
          make={params.make}
          model={params.model}
          postcode={params.postcode}
        />
      )}
    </div>
  );
}
