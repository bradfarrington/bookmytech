import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice } from "@/lib/utils";
import { getRepairCatalogueLevel } from "@/lib/haynespro/catalogue";
import { lookupVehicleAction } from "@/app/actions/lookup-vehicle";
import { VehiclePicker } from "@/components/customer/vehicle-picker";
import { VehicleBanner } from "./vehicle-banner";

// Customer-facing browse of the HaynesPro repair-times tree for THEIR car
// (Task 16 Stage G). Groups drill down (?node=…) until timed leaf repairs,
// each priced from its OEM book time (exact hours, min 1h, × hourly rate) with
// a Book link straight into the existing match → slot → pay funnel.
//
// Server component: all HaynesPro traffic stays server-side and memoised.
//
// Which repairs exist, which are hidden and what they cost is NOT decided here
// — it comes from lib/haynespro/catalogue.ts, the same function behind
// GET /api/mobile/v1/repairs/tree. This file only decides how it looks. That is
// deliberate: the website and the mobile app must never quote a customer
// different prices for the same job on the same car.

interface RepairBrowserProps {
  reg: string;
  make?: string;
  model?: string;
  postcode?: string;
  nodeId?: string;
  /** Breadcrumb trail: "id~label|id~label" down to the current node. */
  crumbs?: string;
}

export async function RepairBrowser({
  reg,
  make,
  model,
  postcode,
  nodeId,
  crumbs,
}: RepairBrowserProps) {
  const result = await getRepairCatalogueLevel(reg, nodeId, createAdminClient());

  if (!result.ok) {
    // `retryable` means the fault is ours (licence down, HaynesPro unreachable),
    // so there is nothing the customer can pick their way out of. Every other
    // failure is about THIS vehicle — we couldn't match the reg, or we matched
    // one with no repair times — and picking the car by hand is a genuine fix
    // rather than a consolation. It used to be a dead end ending in "get in
    // touch", which is why this offers the picker first and the link second.
    //
    // DVLA is only asked here, on the failure path, and it answered a moment ago
    // at step 1, so this is a cache hit rather than a second billed lookup.
    const dvla = result.retryable ? null : await lookupVehicleAction(reg);

    return (
      <div className="flex flex-col gap-4">
        <Empty>
          {result.code === "vehicle_not_matched" && !result.retryable ? (
            <>
              We couldn&apos;t match <span className="font-semibold">{reg}</span> to our
              repair database, so we can&apos;t price repairs for it yet.
            </>
          ) : result.code === "no_repair_data" ? (
            <>There&apos;s no repair-time data for this exact vehicle yet.</>
          ) : (
            <>{result.message}</>
          )}
        </Empty>

        {!result.retryable && (
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-card p-4 shadow-card">
            <div>
              <p className="text-sm font-bold text-text-primary">
                Tell us what you drive
              </p>
              <p className="mt-0.5 text-[13px] text-text-secondary">
                Pick your model and engine and we&apos;ll price repairs against it.
              </p>
            </div>
            <VehiclePicker reg={reg} dvlaMake={dvla?.ok ? dvla.details.make : null} />
          </div>
        )}

        <p className="text-center text-[13px] text-text-muted">
          Still stuck?{" "}
          <Link href="/help" className="font-semibold text-brand-blue hover:underline">
            Get in touch
          </Link>{" "}
          and we&apos;ll sort it for you.
        </p>
      </div>
    );
  }

  const { vehicle, nodes } = result;

  const vehicleParams = [
    make ? `make=${encodeURIComponent(make)}` : null,
    model ? `model=${encodeURIComponent(model)}` : null,
    postcode ? `postcode=${encodeURIComponent(postcode)}` : null,
  ]
    .filter(Boolean)
    .join("&");
  const base = `/book/repairs?reg=${encodeURIComponent(reg)}${vehicleParams ? `&${vehicleParams}` : ""}`;

  const trail = crumbs
    ? crumbs.split("|").map((part) => {
        const [id, ...label] = part.split("~");
        return { id, label: label.join("~") };
      })
    : [];

  const groupHref = (id: string, label: string) => {
    const nextCrumbs = [...trail, { id, label }]
      .map((c) => `${c.id}~${c.label}`)
      .join("|");
    return `${base}&node=${encodeURIComponent(id)}&crumbs=${encodeURIComponent(nextCrumbs)}`;
  };
  const crumbHref = (index: number) => {
    if (index < 0) return base;
    const upto = trail.slice(0, index + 1);
    return `${base}&node=${encodeURIComponent(upto[index].id)}&crumbs=${encodeURIComponent(upto.map((c) => `${c.id}~${c.label}`).join("|"))}`;
  };
  const bookHref = (id: string) =>
    `/book/match?reg=${encodeURIComponent(reg)}&repair=${encodeURIComponent(id)}${vehicleParams ? `&${vehicleParams}` : ""}`;

  return (
    <div className="flex flex-col gap-4">
      <VehicleBanner
        reg={reg}
        description={vehicle.description}
        make={vehicle.make}
      />

      {/* Breadcrumbs */}
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-text-secondary">
        <Link href={crumbHref(-1)} className="font-semibold text-brand-blue hover:underline">
          All repairs
        </Link>
        {trail.map((c, i) => (
          <span key={`${c.id}-${i}`} className="flex items-center gap-1.5">
            <span className="text-text-muted">/</span>
            {i === trail.length - 1 ? (
              <span className="font-semibold text-text-primary">{c.label}</span>
            ) : (
              <Link href={crumbHref(i)} className="text-brand-blue hover:underline">
                {c.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface-card shadow-card">
        {nodes.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-text-muted">
            Nothing under this group.
          </p>
        )}
        <ul className="divide-y divide-border-subtle">
          {nodes.map((node) => {
            if (node.kind === "group") {
              return (
                <li key={node.id}>
                  <Link
                    href={groupHref(node.id, node.description)}
                    className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface"
                  >
                    {node.description}
                    <ChevronRight size={16} className="shrink-0 text-text-muted" />
                  </Link>
                </li>
              );
            }
            return (
              <li
                key={node.id}
                className="flex items-center justify-between gap-3 px-4 py-3.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">
                    {node.description}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    Estimated {node.billedHours} hour
                    {node.billedHours === 1 ? "" : "s"} on your car
                  </p>
                </div>
                <Link
                  href={bookHref(node.id)}
                  className="flex shrink-0 items-center gap-2 rounded-lg bg-brand-blue px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-blue/90"
                >
                  {formatPrice(node.pricePence ?? 0)}
                  <ChevronRight size={14} />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="text-xs text-text-muted">
        Prices cover labour for the selected repair, based on the
        manufacturer&apos;s book time for your exact vehicle. Parts, if needed,
        are agreed with your mechanic.
      </p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-border bg-surface-card px-4 py-8 text-center text-sm text-text-muted">
      {children}
    </p>
  );
}
