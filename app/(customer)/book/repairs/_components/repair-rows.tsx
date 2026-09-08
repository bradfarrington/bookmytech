import Link from "next/link";
import { Check, ChevronRight, Layers, Plus } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type { CatalogueNode } from "@/lib/haynespro/catalogue";

// One level of the repair catalogue as the customer sees it: groups to drill
// into, priced repairs with a Book / Add button, and combined repairs drawn as
// one card with a button per option. No directive on purpose — the server
// browse list AND the client search box (Task 30) render their rows through
// this, so a hit found by searching looks and links exactly like the same
// job found by browsing.

/** A level's rows: a combined repair's options are drawn as one card. */
export type Row =
  | { kind: "group"; node: CatalogueNode }
  | { kind: "repair"; node: CatalogueNode }
  | { kind: "bundle"; bundleId: string; name: string; options: CatalogueNode[] };

export function toRows(nodes: CatalogueNode[]): Row[] {
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

export interface RepairRowsProps {
  nodes: CatalogueNode[];
  /** Items already in the booking. */
  selectedIds: readonly string[];
  /** True once something is chosen — buttons read "Add" instead of "Book". */
  adding: boolean;
  /** True at the per-booking cap — prices shown, buttons withheld. */
  atCap: boolean;
  groupHref: (id: string, label: string) => string;
  bookHref: (id: string) => string;
  /** Shown when there are no rows. */
  emptyLabel?: React.ReactNode;
  /** Extra caption under a group row (the search box says where a hit lives). */
  groupCaption?: (node: CatalogueNode) => React.ReactNode;
}

export function RepairRows({
  nodes,
  selectedIds,
  adding,
  atCap,
  groupHref,
  bookHref,
  emptyLabel = "Nothing under this group.",
  groupCaption,
}: RepairRowsProps) {
  const rows = toRows(nodes);

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
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-card shadow-card">
      {rows.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-text-muted">{emptyLabel}</p>
      )}
      <ul className="divide-y divide-border-subtle">
        {rows.map((row) => {
          if (row.kind === "group") {
            const caption = groupCaption?.(row.node) ?? row.node.summary;
            // The top of the catalogue (Repairs, Diagnostics, Servicing,
            // Pre-purchase inspection — Task 31) reads as cards: a bigger
            // title with the blurb under it.
            const top = row.node.summary != null;
            return (
              <li key={row.node.id}>
                <Link
                  href={groupHref(row.node.id, row.node.description)}
                  className={`flex items-center justify-between gap-3 px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface ${top ? "py-4" : "py-3.5"}`}
                >
                  <span className="min-w-0">
                    <span className={top ? "text-base font-bold" : ""}>{row.node.description}</span>
                    {caption && <span className="mt-0.5 block text-xs font-normal text-text-muted">{caption}</span>}
                  </span>
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
          // A product (Task 31): its summary, then whether the price is set or
          // by the hour, and the engine-oil line a service includes.
          if (row.node.productId) {
            const { node } = row;
            const hours = node.durationHours ?? node.billedHours ?? 1;
            return (
              <li key={node.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">{node.description}</p>
                  {node.summary && <p className="mt-0.5 text-xs text-text-secondary">{node.summary}</p>}
                  <p className="mt-0.5 text-xs text-text-muted">
                    {node.fixedPrice
                      ? `Fixed price · about ${hours} hour${hours === 1 ? "" : "s"}`
                      : `Estimated ${node.billedHours} hour${node.billedHours === 1 ? "" : "s"} at our hourly rate`}
                    {node.oil && node.oil.pence > 0 && (
                      <>
                        {" · "}includes engine oil, {node.oil.litres} L × {formatPrice(node.oil.pencePerLitre)}
                      </>
                    )}
                  </p>
                </div>
                {bookButton(node)}
              </li>
            );
          }
          return (
            <li key={row.node.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">{row.node.description}</p>
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
  );
}
