"use client";

import { useMemo, useState } from "react";
import { Info, LayoutGrid, List as ListIcon, X } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Select } from "@/components/ui/select";
import {
  brandsOf,
  filterRows,
  sortRows,
  type ComparisonCell,
  type ComparisonRow,
  type SortKey,
} from "@/lib/parts/compare-rows";
import { cn, formatPrice } from "@/lib/utils";
import type { PartTypeResult, SupplierNote } from "@/app/actions/lkq";

// The catalogue browser (Task 42).
//
// One row per part, one COLUMN PER SUPPLIER. LKQ and AAG number the same
// physical part differently, so a row carries each supplier's own part number
// beside its own price; a dash means that supplier doesn't offer it.
//
// Money rules, same as everywhere else in this feature:
//   - cost and surcharge are never summed (docs/06-lkq-parts-api.md §8 Q1);
//   - an unpriced part shows "—", never £0.00;
//   - a null stock figure shows "—", never "0".

export type ViewMode = "list" | "cards";

const SUPPLIER_FILTERS = [
  { value: "all", label: "Both suppliers" },
  { value: "lkq", label: "LKQ only" },
  { value: "aag", label: "Alliance only" },
];

const SORTS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: "price", label: "Cheapest first" },
  { value: "brand", label: "Brand A–Z" },
  { value: "name", label: "Name A–Z" },
];

function money(pence: number | null | undefined): string {
  return pence == null ? "—" : formatPrice(pence);
}

function stockSummary(cell: ComparisonCell | null): string {
  if (!cell || cell.availability.length === 0) return "—";
  return cell.availability
    .map((l) => `${l.label} ${l.qty == null ? "—" : l.qty}`)
    .join(" · ");
}

/** One supplier's part number + price, or a clear absence. */
function SupplierCell({
  cell,
  isCheapest,
}: {
  cell: ComparisonCell | null;
  isCheapest: boolean;
}) {
  if (!cell) {
    return <span className="text-sm text-text-muted">—</span>;
  }
  return (
    <div>
      <div className="font-mono text-[11px] text-text-muted">{cell.partNumber}</div>
      <div
        className={cn(
          "font-semibold",
          cell.costPence == null ? "text-text-muted" : "text-text-primary",
        )}
      >
        {money(cell.costPence)}
        {isCheapest && cell.costPence != null ? (
          <span className="ml-1.5 align-middle">
            <Pill tone="success">Best</Pill>
          </span>
        ) : null}
      </div>
      {cell.surchargePence != null ? (
        <div className="text-[11px] text-amber-700">+{money(cell.surchargePence)} surcharge</div>
      ) : null}
      {cell.costPence == null ? (
        <div className="text-[11px] text-text-muted">not priced</div>
      ) : null}
    </div>
  );
}

function RowNotes({ row }: { row: ComparisonRow }) {
  const notes = [...(row.lkq?.notes ?? []), ...(row.aag?.notes ?? [])];
  if (notes.length === 0) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {notes.map((note) => (
        <div key={note} className="flex items-start gap-1 text-[11px] text-amber-700">
          <Info aria-hidden className="mt-0.5 size-3 shrink-0" />
          <span>{note}</span>
        </div>
      ))}
    </div>
  );
}

function ListView({ rows }: { rows: ComparisonRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-text-muted">
            <th className="py-2 pl-4 pr-3 text-left">Part</th>
            <th className="px-3 py-2 text-left">Brand</th>
            <th className="px-3 py-2 text-right">LKQ</th>
            <th className="px-3 py-2 text-right">Alliance</th>
            <th className="py-2 pl-3 pr-4 text-left">Stock (LKQ)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-border align-top last:border-0">
              <td className="py-2.5 pl-4 pr-3">
                <div className="flex items-start gap-2.5">
                  {row.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.imageUrl}
                      alt=""
                      loading="lazy"
                      className="size-10 shrink-0 rounded border border-border bg-white object-contain"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <div className="text-text-primary">{row.name}</div>
                    {row.fitment.length > 0 ? (
                      <div className="mt-0.5 text-[11px] text-text-muted">
                        {row.fitment.map((f) => `${f.label}: ${f.value}`).join(" · ")}
                      </div>
                    ) : null}
                    {row.quantityOfFit && row.quantityOfFit > 1 ? (
                      <div className="mt-0.5 text-[11px] text-text-muted">
                        Needs {row.quantityOfFit}
                        {row.cheapestPence != null
                          ? ` · ${formatPrice(row.cheapestPence * row.quantityOfFit)} for the set`
                          : ""}
                      </div>
                    ) : null}
                    <RowNotes row={row} />
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5">
                <div className="font-semibold text-text-primary">{row.brand ?? "—"}</div>
                {row.tier ? <Pill tone="neutral">{row.tier}</Pill> : null}
              </td>
              <td className="px-3 py-2.5 text-right">
                <SupplierCell cell={row.lkq} isCheapest={row.cheapestSupplier === "lkq"} />
              </td>
              <td className="px-3 py-2.5 text-right">
                <SupplierCell cell={row.aag} isCheapest={row.cheapestSupplier === "aag"} />
              </td>
              <td className="py-2.5 pl-3 pr-4 text-xs text-text-muted">
                {stockSummary(row.lkq)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardView({ rows }: { rows: ComparisonRow[] }) {
  return (
    <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <div
          key={row.key}
          className="flex flex-col rounded-xl border border-border bg-surface-card p-3"
        >
          <div className="flex items-start gap-3">
            {row.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.imageUrl}
                alt=""
                loading="lazy"
                className="size-16 shrink-0 rounded-md border border-border bg-white object-contain"
              />
            ) : (
              <div className="size-16 shrink-0 rounded-md border border-dashed border-border" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-semibold text-text-primary">
                  {row.brand ?? "Unbranded"}
                </span>
                {row.tier ? <Pill tone="neutral">{row.tier}</Pill> : null}
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{row.name}</p>
            </div>
          </div>

          {row.fitment.length > 0 ? (
            <p className="mt-2 text-[11px] text-text-muted">
              {row.fitment.map((f) => `${f.label}: ${f.value}`).join(" · ")}
            </p>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-text-muted">LKQ</div>
              <SupplierCell cell={row.lkq} isCheapest={row.cheapestSupplier === "lkq"} />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-text-muted">Alliance</div>
              <SupplierCell cell={row.aag} isCheapest={row.cheapestSupplier === "aag"} />
            </div>
          </div>

          {row.quantityOfFit && row.quantityOfFit > 1 && row.cheapestPence != null ? (
            <p className="mt-2 text-[11px] text-text-muted">
              Needs {row.quantityOfFit} · {formatPrice(row.cheapestPence * row.quantityOfFit)} for
              the set
            </p>
          ) : null}

          <RowNotes row={row} />
        </div>
      ))}
    </div>
  );
}

function SupplierNotes({ notes }: { notes: SupplierNote[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="space-y-1.5 border-t border-border bg-surface-subtle/40 px-4 py-3">
      {notes.map((note) => (
        <div key={`${note.supplier}-${note.message}`} className="text-xs text-text-muted">
          <span className="font-semibold text-text-primary">
            {note.supplier === "lkq" ? "LKQ" : "Alliance Automotive"}:
          </span>{" "}
          {note.message}
          {note.hint ? <span className="text-text-muted"> {note.hint}</span> : null}
          {note.href ? (
            <>
              {" "}
              <Link href={note.href} className="font-semibold text-brand-blue hover:underline">
                Check the connection
              </Link>
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export interface CatalogueBrowserProps {
  results: PartTypeResult[];
  onRemove: (component: string) => void;
}

export function CatalogueBrowser({ results, onRemove }: CatalogueBrowserProps) {
  const [view, setView] = useState<ViewMode>("list");
  const [brand, setBrand] = useState("all");
  const [supplier, setSupplier] = useState("all");
  const [sort, setSort] = useState<SortKey>("price");
  const [query, setQuery] = useState("");

  const allRows = useMemo(() => results.flatMap((r) => r.rows), [results]);
  const brands = useMemo(() => brandsOf(allRows), [allRows]);
  const notFound = useMemo(() => results.flatMap((r) => r.notFound), [results]);
  const notes = useMemo(() => results.flatMap((r) => r.notes), [results]);

  const visible = useMemo(
    () => sortRows(filterRows(allRows, { brand, supplier, query }), sort),
    [allRows, brand, supplier, query, sort],
  );

  if (results.length === 0) return null;

  const brandOptions = [
    { value: "all", label: `All brands (${brands.length})` },
    ...brands.map((b) => ({ value: b, label: b })),
  ];

  return (
    <Card padded={false} className="overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="mr-auto flex flex-wrap items-center gap-1.5">
          {results.map((r) => (
            <span
              key={r.component}
              className="inline-flex items-center gap-1 rounded-full bg-border-subtle px-2.5 py-1 text-xs font-semibold text-slate-700"
            >
              {r.componentName}
              <span className="font-normal text-text-muted">{r.rows.length}</span>
              {r.cached ? <span className="font-normal text-text-muted">· cached</span> : null}
              <button
                type="button"
                onClick={() => onRemove(r.component)}
                aria-label={`Remove ${r.componentName}`}
                className="text-text-muted hover:text-text-primary"
              >
                <X aria-hidden className="size-3" />
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-center rounded-md border border-border p-0.5">
          <button
            type="button"
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
            aria-label="List view"
            className={cn(
              "rounded px-2 py-1 transition",
              view === "list" ? "bg-brand-blue text-white" : "text-text-muted hover:text-text-primary",
            )}
          >
            <ListIcon aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setView("cards")}
            aria-pressed={view === "cards"}
            aria-label="Card view"
            className={cn(
              "rounded px-2 py-1 transition",
              view === "cards"
                ? "bg-brand-blue text-white"
                : "text-text-muted hover:text-text-primary",
            )}
          >
            <LayoutGrid aria-hidden className="size-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search part number or name…"
          aria-label="Search results"
          className="h-9 min-w-[200px] flex-1 rounded-md border border-border bg-surface-card px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-blue"
        />
        <Select
          value={brand}
          onChange={setBrand}
          options={brandOptions}
          aria-label="Filter by brand"
          className="min-w-[160px]"
        />
        <Select
          value={supplier}
          onChange={setSupplier}
          options={SUPPLIER_FILTERS}
          aria-label="Filter by supplier"
          className="min-w-[150px]"
        />
        <Select<SortKey>
          value={sort}
          onChange={setSort}
          options={SORTS}
          aria-label="Sort"
          className="min-w-[150px]"
        />
        <span className="text-xs text-text-muted">
          {visible.length} of {allRows.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-text-muted">
          Nothing matches those filters.
        </p>
      ) : view === "list" ? (
        <ListView rows={visible} />
      ) : (
        <CardView rows={visible} />
      )}

      {notFound.length > 0 ? (
        <p className="border-t border-border bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          {notFound.length} catalogue part{notFound.length === 1 ? "" : "s"} came back with no
          price and no description, so {notFound.length === 1 ? "it has" : "they have"} been left
          out rather than shown as free:{" "}
          <span className="font-mono">{notFound.join(", ")}</span>
        </p>
      ) : null}

      <SupplierNotes notes={notes} />
    </Card>
  );
}
