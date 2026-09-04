import Link from "next/link";
import { Check, ChevronRight, Layers, Plus } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice } from "@/lib/utils";
import { getRepairCatalogueLevel, type CatalogueNode } from "@/lib/haynespro/catalogue";
import { quoteRepairs } from "@/lib/haynespro/repair-booking";
import { MAX_REPAIRS_PER_BOOKING, repairsQuery } from "@/lib/bookings/repair-ids";
import { lookupVehicleAction } from "@/app/actions/lookup-vehicle";
import { VehiclePicker } from "@/components/customer/vehicle-picker";
import { VehicleBanner } from "./vehicle-banner";

// Customer-facing browse of the repair catalogue for THEIR car (Task 16
// Stage G): HaynesPro's repair-times tree plus the admin's layer over it
// (Task 26 — renamed and moved jobs, our own categories, combined repairs).
// Groups drill down (?node=…) until priced items, each with a Book link
// straight into the existing match → slot → pay funnel.
//
// With jobs already chosen (`selectedIds`, Task 24) the same page is the "add
// another job" step: a sticky card shows the booking so far, chosen items
// read "Added", the rest read "Add" and return to the price page with the new
// id appended. The booking is priced as a whole there.
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
  pref?: string;
  nodeId?: string;
  /** Breadcrumb trail: "id~label|id~label" down to the current node. */
  crumbs?: string;
  /** Items already in the booking, in order. Empty = starting a booking. */
  selectedIds: string[];
}

/** A level's rows: a combined repair's options are drawn as one card. */
type Row =
  | { kind: "group"; node: CatalogueNode }
  | { kind: "repair"; node: CatalogueNode }
  | { kind: "bundle"; bundleId: string; name: string; options: CatalogueNode[] };

function toRows(nodes: CatalogueNode[]): Row[] {
  const rows: Row[] = [];
  const bundles = new Map<string, Extract<Row, { kind: "bundle" }>>();
  for (const node of nodes) {
    if (node.kind === "group") {
      rows.push({ kind: "group", node });
    } else if (node.bundleId) {
      let bundle = bundles.get(node.bundleId);
      if (!bundle) {
        bundle = { kind: "bundle", bundleId: node.bundleId, name: node.bundleName ?? node.description, options: [] };
        bundles.set(node.bundleId, bundle);
        rows.push(bundle);
      }
      bundle.options.push(node);
    } else {
      rows.push({ kind: "repair", node });
    }
  }
  return rows;
}

export async function RepairBrowser({
  reg,
  make,
  model,
  postcode,
  pref,
  nodeId,
  crumbs,
  selectedIds,
}: RepairBrowserProps) {
  const admin = createAdminClient();
  const [result, trolley] = await Promise.all([
    getRepairCatalogueLevel(reg, nodeId, admin),
    // Memo hit — the price page just priced the same set.
    selectedIds.length ? quoteRepairs(reg, selectedIds, admin) : Promise.resolve(null),
  ]);

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
  const rows = toRows(nodes);

  const vehicleParams = [
    make ? `make=${encodeURIComponent(make)}` : null,
    model ? `model=${encodeURIComponent(model)}` : null,
    postcode ? `postcode=${encodeURIComponent(postcode)}` : null,
    pref ? `pref=${encodeURIComponent(pref)}` : null,
  ]
    .filter(Boolean)
    .join("&");
  const selectedQuery = repairsQuery(selectedIds);
  // Every browse link keeps the booking so far.
  const base = `/book/repairs?reg=${encodeURIComponent(reg)}${vehicleParams ? `&${vehicleParams}` : ""}${selectedQuery ? `&${selectedQuery}` : ""}`;
  const adding = selectedIds.length > 0;
  const atCap = selectedIds.length >= MAX_REPAIRS_PER_BOOKING;

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
  // The price page, with this item appended to whatever is already chosen.
  const bookHref = (id: string) =>
    `/book/match?reg=${encodeURIComponent(reg)}&${repairsQuery([...selectedIds, id])}${vehicleParams ? `&${vehicleParams}` : ""}`;
  const continueHref = `/book/match?reg=${encodeURIComponent(reg)}&${selectedQuery}${vehicleParams ? `&${vehicleParams}` : ""}`;

  const bookButton = (node: CatalogueNode, label?: string) => {
    if (selectedIds.includes(node.id)) {
      return (
        <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-green-50 px-3.5 py-2 text-sm font-bold text-success">
          <Check size={14} strokeWidth={3} />
          Added
        </span>
      );
    }
    if (atCap) {
      return (
        <span className="shrink-0 text-sm font-semibold text-text-muted">
          {label ? `${label} · ` : ""}
          {formatPrice(node.pricePence ?? 0)}
        </span>
      );
    }
    return (
      <Link
        href={bookHref(node.id)}
        className="flex shrink-0 items-center gap-2 rounded-lg bg-brand-blue px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-blue/90"
      >
        {label && <span className="text-xs font-semibold text-blue-100">{label}</span>}
        {formatPrice(node.pricePence ?? 0)}
        {adding ? (
          <>
            <span className="text-xs font-semibold text-blue-100">Add</span>
            <Plus size={14} />
          </>
        ) : (
          <ChevronRight size={14} />
        )}
      </Link>
    );
  };

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
        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-text-muted">
            Nothing under this group.
          </p>
        )}
        <ul className="divide-y divide-border-subtle">
          {rows.map((row) => {
            if (row.kind === "group") {
              return (
                <li key={row.node.id}>
                  <Link
                    href={groupHref(row.node.id, row.node.description)}
                    className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface"
                  >
                    {row.node.description}
                    <ChevronRight size={16} className="shrink-0 text-text-muted" />
                  </Link>
                </li>
              );
            }
            if (row.kind === "bundle") {
              const single = row.options.length === 1;
              return (
                <li key={row.bundleId} className="px-4 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
                        <Layers size={14} className="shrink-0 text-brand-blue" />
                        {row.name}
                      </p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {single
                          ? `Combined repair · estimated ${row.options[0].billedHours} hour${row.options[0].billedHours === 1 ? "" : "s"} on your car`
                          : "Combined repair · choose an option"}
                      </p>
                    </div>
                    {single && bookButton(row.options[0])}
                  </div>
                  {!single && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {row.options.map((option) => (
                        <span key={option.id} className="flex items-center gap-2">
                          {bookButton(option, option.optionLabel ?? undefined)}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              );
            }
            return (
              <li
                key={row.node.id}
                className="flex items-center justify-between gap-3 px-4 py-3.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">
                    {row.node.description}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    Estimated {row.node.billedHours} hour
                    {row.node.billedHours === 1 ? "" : "s"} on your car
                  </p>
                </div>
                {bookButton(row.node)}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="text-xs text-text-muted">
        Prices cover labour for the selected repair{adding ? "s" : ""}, based on the
        manufacturer&apos;s book time for your exact vehicle.
        {adding && " Jobs booked together are done in one visit."}
      </p>

      {adding && (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-2xl border border-brand-blue/30 bg-surface-card p-4 shadow-hero">
          <div className="min-w-0">
            <p className="text-sm font-bold text-text-primary">
              Your jobs ({selectedIds.length})
              {trolley ? ` · ${formatPrice(trolley.breakdown.totalPence)}` : ""}
            </p>
            <p className="mt-0.5 truncate text-xs text-text-muted">
              {trolley
                ? trolley.items
                    .map((item) => item.label ?? trolley.lines.find((l) => l.itemId === item.id)?.description ?? "")
                    .filter(Boolean)
                    .join(" · ")
                : "Continue to see the price for the whole visit."}
              {atCap && ` · You can book up to ${MAX_REPAIRS_PER_BOOKING} jobs in one visit.`}
            </p>
          </div>
          <Link
            href={continueHref}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-blue/90"
          >
            Continue
            <ChevronRight size={14} />
          </Link>
        </div>
      )}
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
