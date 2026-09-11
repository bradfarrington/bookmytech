"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Info } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import {
  groupOffers,
  SUPPLIER_LABEL,
  type SupplierId,
  type SupplierOffer,
  type SupplierPanel,
} from "@/lib/parts/supplier-offer";
import { cn, formatPrice } from "@/lib/utils";

// One supplier's column (Task 42). Both columns render through THIS component,
// from the normalised SupplierOffer shape, so the two are genuinely comparable
// rather than merely adjacent.
//
// Money rules enforced here:
//   - Cost and surcharge are separate columns and are NEVER added together.
//     Whether LKQ's ShowPrice already includes the surcharge is unverified and
//     worth up to £59.95 on a starter motor (docs/06-lkq-parts-api.md §8 Q1).
//   - An unpriced variant renders "—", never £0.00.
//   - A null stock figure renders "—" ("no figure given"), never "0".

function money(pence: number | null): string {
  return pence == null ? "—" : formatPrice(pence);
}

function StockCell({ offer }: { offer: SupplierOffer }) {
  if (offer.availability.length === 0) {
    return <span className="text-text-muted">—</span>;
  }
  return (
    <ul className="space-y-0.5">
      {offer.availability.map((line, i) => (
        <li key={`${line.label}-${i}`} className="whitespace-nowrap text-xs">
          <span className={cn(line.emphasis && "font-semibold text-text-primary")}>
            {line.label}
          </span>{" "}
          <span className="text-text-muted">{line.qty == null ? "—" : line.qty}</span>
          {line.eta ? <span className="text-text-muted"> · {line.eta}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function OfferRow({
  offer,
  isCheapestHere,
  isBestOverall,
}: {
  offer: SupplierOffer;
  isCheapestHere: boolean;
  isBestOverall: boolean;
}) {
  return (
    <tr className="border-b border-border last:border-0 align-top">
      <td className="py-2.5 pl-4 pr-3">
        <div className="font-mono text-xs text-text-primary">{offer.partNumber}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {offer.brand ? (
            <span className="text-xs font-semibold text-text-primary">{offer.brand}</span>
          ) : null}
          {offer.tier ? <Pill tone="neutral">{offer.tier}</Pill> : null}
          {isBestOverall ? <Pill tone="success">Best price</Pill> : null}
          {!isBestOverall && isCheapestHere ? <Pill tone="accent">Cheapest here</Pill> : null}
        </div>
        {offer.description ? (
          <div className="mt-1 text-xs text-text-muted">{offer.description}</div>
        ) : null}
        {offer.notes.map((note) => (
          <div key={note} className="mt-1 flex items-start gap-1 text-xs text-amber-700">
            <Info aria-hidden className="mt-0.5 size-3 shrink-0" />
            <span>{note}</span>
          </div>
        ))}
      </td>

      <td className="px-3 py-2.5 text-right">
        <div className={cn("font-semibold", offer.costPence == null && "text-text-muted")}>
          {money(offer.costPence)}
        </div>
        {offer.quantityOfFit && offer.quantityOfFit > 1 && offer.costPence != null ? (
          <div className="mt-0.5 whitespace-nowrap text-xs text-text-muted">
            needs {offer.quantityOfFit} · {formatPrice(offer.costPence * offer.quantityOfFit)}
          </div>
        ) : null}
      </td>

      <td className="px-3 py-2.5 text-right text-text-muted">{money(offer.surchargePence)}</td>
      <td className="px-3 py-2.5 text-right text-text-muted">{money(offer.rrpPence)}</td>
      <td className="py-2.5 pl-3 pr-4">
        <StockCell offer={offer} />
      </td>
    </tr>
  );
}

function OfferGroup({
  groupKey,
  offers,
  cheapestPartNumber,
  bestPartNumber,
  defaultOpen,
}: {
  groupKey: string;
  offers: SupplierOffer[];
  cheapestPartNumber: string | null;
  bestPartNumber: string | null;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const priced = offers.filter((o) => o.costPence != null);
  const from = priced.length > 0 ? Math.min(...priced.map((o) => o.costPence as number)) : null;
  const lead = priced.find((o) => o.costPence === from) ?? offers[0];
  const fitment = offers[0]?.fitment ?? [];
  const panelId = `offers-${groupKey}`;

  return (
    <>
      <tr className="border-b border-border bg-surface-subtle/40">
        <td colSpan={5} className="px-4 py-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={panelId}
            className="flex w-full items-center gap-2 text-left"
          >
            {open ? (
              <ChevronDown aria-hidden className="size-4 shrink-0 text-text-muted" />
            ) : (
              <ChevronRight aria-hidden className="size-4 shrink-0 text-text-muted" />
            )}
            <span className="font-mono text-xs font-semibold text-text-primary">{groupKey}</span>
            <span className="text-xs text-text-muted">
              {from != null ? `from ${formatPrice(from)}` : "not priced"}
              {lead?.brand ? ` · ${lead.brand}` : ""} · {offers.length}{" "}
              {offers.length === 1 ? "option" : "options"}
            </span>
          </button>
          {fitment.length > 0 ? (
            <div className="mt-1 pl-6 text-xs text-text-muted">
              {fitment.map((f) => `${f.label}: ${f.value}`).join(" · ")}
            </div>
          ) : null}
        </td>
      </tr>
      {open
        ? offers.map((offer) => (
            <OfferRow
              key={`${offer.partNumber}-${offer.brand ?? ""}`}
              offer={offer}
              isCheapestHere={offer.partNumber === cheapestPartNumber}
              isBestOverall={offer.partNumber === bestPartNumber}
            />
          ))
        : null}
    </>
  );
}

function PanelMessage({
  title,
  message,
  hint,
  href,
  tone,
}: {
  title: string;
  message: string;
  hint?: string | null;
  href?: string | null;
  tone: "neutral" | "pending" | "error";
}) {
  return (
    <div className="px-6 py-10 text-center">
      <Pill tone={tone}>{title}</Pill>
      <p className="mx-auto mt-3 max-w-sm text-sm text-text-primary">{message}</p>
      {hint ? <p className="mx-auto mt-1.5 max-w-sm text-xs text-text-muted">{hint}</p> : null}
      {href ? (
        <Link
          href={href}
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:underline"
        >
          Check the connection
          <ExternalLink aria-hidden className="size-3" />
        </Link>
      ) : null}
    </div>
  );
}

export interface SupplierPanelCardProps {
  supplier: SupplierId;
  panel: SupplierPanel;
  /** Part number of the cheapest offer across BOTH suppliers, when known. */
  bestPartNumber: string | null;
  bestSupplier: SupplierId | null;
}

export function SupplierPanelCard({
  supplier,
  panel,
  bestPartNumber,
  bestSupplier,
}: SupplierPanelCardProps) {
  const title = SUPPLIER_LABEL[supplier];
  const bestHere = bestSupplier === supplier ? bestPartNumber : null;

  return (
    <Card padded={false} className="overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {panel.state === "ok" ? (
          <div className="flex items-center gap-2">
            {panel.cached ? <Pill tone="neutral">Cached</Pill> : <Pill tone="accent">Live</Pill>}
            <span className="text-xs text-text-muted">
              {panel.offers.length} {panel.offers.length === 1 ? "option" : "options"}
            </span>
          </div>
        ) : null}
      </header>

      {panel.state === "not_connected" ? (
        <PanelMessage
          title="Not connected"
          message={panel.message}
          hint={panel.hint}
          href={panel.href}
          tone="pending"
        />
      ) : null}

      {panel.state === "not_mapped" ? (
        <PanelMessage title="No equivalent" message={panel.message} tone="neutral" />
      ) : null}

      {panel.state === "empty" ? (
        <PanelMessage title="Nothing listed" message={panel.message} tone="neutral" />
      ) : null}

      {panel.state === "error" ? (
        <PanelMessage title="Couldn't load" message={panel.message} tone="error" />
      ) : null}

      {panel.state === "ok" ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <th className="py-2 pl-4 pr-3 text-left">Part</th>
                  <th className="px-3 py-2 text-right">Cost</th>
                  <th className="px-3 py-2 text-right">Surcharge</th>
                  <th className="px-3 py-2 text-right">RRP</th>
                  <th className="py-2 pl-3 pr-4 text-left">Stock</th>
                </tr>
              </thead>
              <tbody>
                {groupOffers(panel.offers).map((group, index) => (
                  <OfferGroup
                    key={group.groupKey}
                    groupKey={group.groupKey}
                    offers={group.offers}
                    cheapestPartNumber={panel.cheapestPartNumber}
                    bestPartNumber={bestHere}
                    defaultOpen={index === 0}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {panel.notFound.length > 0 ? (
            <p className="border-t border-border bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
              {panel.notFound.length} part{panel.notFound.length === 1 ? "" : "s"} in the
              catalogue came back with no price and no description, so{" "}
              {panel.notFound.length === 1 ? "it has" : "they have"} been left out rather than
              shown as free: <span className="font-mono">{panel.notFound.join(", ")}</span>
            </p>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
