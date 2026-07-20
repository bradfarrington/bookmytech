import Link from "next/link";
import { ChevronRight, Wrench } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice } from "@/lib/utils";
import { billableHours } from "@/lib/pricing/billable";
import { getHourlyRatePence } from "@/lib/pricing/calculate";
import { excludedRepairNodeIdsForVehicle } from "@/lib/haynespro/exclusions";
import { getRepairtimeSubnodes } from "@/lib/haynespro/tree";
import { resolveVehicle } from "@/lib/haynespro/vehicle";

// Customer-facing browse of the HaynesPro repair-times tree for THEIR car
// (Task 16 Stage G). Groups drill down (?node=…) until timed leaf repairs,
// each priced from its OEM book time (billed whole hours × hourly rate) with
// a Book link straight into the existing match → slot → pay funnel.
//
// Server component: all HaynesPro traffic stays server-side and memoised.

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
  const admin = createAdminClient();
  const vehicle = await resolveVehicle(reg, admin);

  if (!vehicle) {
    return (
      <Empty>
        We couldn&apos;t match your reg to our repair database, so we
        can&apos;t price repairs for this vehicle online yet. Please{" "}
        <Link href="/help" className="font-semibold text-brand-blue hover:underline">
          get in touch
        </Link>{" "}
        and we&apos;ll sort it for you.
      </Empty>
    );
  }
  if (vehicle.repairtimeTypeId == null) {
    return (
      <Empty>
        There&apos;s no repair-time data for this exact vehicle yet. Please{" "}
        <Link href="/help" className="font-semibold text-brand-blue hover:underline">
          get in touch
        </Link>{" "}
        and we&apos;ll sort it for you.
      </Empty>
    );
  }

  // Per-model repair availability (admin toggles): excluded groups and
  // repairs simply don't render — hiding a group hides everything under it
  // because there's no way to drill in.
  const [allNodes, hourlyRatePence, excluded] = await Promise.all([
    getRepairtimeSubnodes(vehicle.repairtimeTypeId, nodeId || "root"),
    getHourlyRatePence(admin),
    excludedRepairNodeIdsForVehicle(vehicle.hpModelLabel, admin),
  ]);
  const nodes = allNodes.filter((n) => n.id == null || !excluded.has(n.id));

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
      {vehicle.description && (
        <p className="flex items-center gap-2 rounded-lg bg-blue-50/60 px-3.5 py-2.5 text-[13px] text-text-secondary">
          <Wrench size={14} className="shrink-0 text-brand-blue" />
          Repair times matched to your {vehicle.description}
        </p>
      )}

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
            if (node.id == null) return null;
            if (node.hasSubnodes) {
              return (
                <li key={node.id}>
                  <Link
                    href={groupHref(node.id, node.description ?? node.id)}
                    className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface"
                  >
                    {node.description}
                    <ChevronRight size={16} className="shrink-0 text-text-muted" />
                  </Link>
                </li>
              );
            }
            const billed = billableHours(
              typeof node.value === "number" ? node.value / 100 : null,
            );
            if (billed == null) return null; // untimed leaf — not bookable
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
                    Estimated {billed} hour{billed === 1 ? "" : "s"} on your car
                  </p>
                </div>
                <Link
                  href={bookHref(node.id)}
                  className="flex shrink-0 items-center gap-2 rounded-lg bg-brand-blue px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-blue/90"
                >
                  {formatPrice(Math.round(billed * hourlyRatePence))}
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
