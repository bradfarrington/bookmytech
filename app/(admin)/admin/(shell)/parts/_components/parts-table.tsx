"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Pencil, Trash2, PackageCheck, PackageX, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { cn, formatPrice } from "@/lib/utils";
import { marginPct } from "@/lib/parts/margin";
import { setPartStock, deletePart } from "@/app/actions/parts";

export interface PartRow {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  supplier: string | null;
  supplier_cost_pence: number;
  bmt_price_pence: number;
  in_stock: boolean;
  is_active: boolean;
}

function prettyCategory(c: string): string {
  return c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export function PartsTable({ parts }: { parts: PartRow[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [stock, setStock] = useState<string>("all");
  const [pending, startTransition] = useTransition();

  const categories = useMemo(() => {
    const set = new Set(parts.map((p) => p.category));
    return ["all", ...[...set].sort()];
  }, [parts]);

  const filtered = parts.filter((p) => {
    if (category !== "all" && p.category !== category) return false;
    if (stock === "in" && !p.in_stock) return false;
    if (stock === "out" && p.in_stock) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      if (
        !p.name.toLowerCase().includes(q) &&
        !(p.sku ?? "").toLowerCase().includes(q) &&
        !(p.supplier ?? "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  function toggleStock(p: PartRow) {
    startTransition(async () => {
      const res = await setPartStock(p.id, !p.in_stock);
      if (res?.error) toast.error(res.error);
      else toast.success(p.in_stock ? "Marked out of stock." : "Marked in stock.");
    });
  }

  function remove(p: PartRow) {
    if (!confirm(`Delete "${p.name}"? This can't be undone.`)) return;
    startTransition(async () => {
      const res = await deletePart(p.id);
      if (res?.error) toast.error(res.error);
      else toast.success("Part deleted.");
    });
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
        <label className="flex h-10 flex-1 items-center gap-2 rounded-button border border-border bg-surface-card px-3 focus-within:border-brand-blue focus-within:ring-2 focus-within:ring-brand-blue/20">
          <Search size={15} className="shrink-0 text-text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, SKU or supplier…"
            className="h-full flex-1 border-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
        </label>
        <div className="flex gap-2">
          <Select
            value={category}
            onChange={setCategory}
            options={categories.map((c) => ({
              value: c,
              label: c === "all" ? "All categories" : prettyCategory(c),
            }))}
            aria-label="Filter by category"
            className="min-w-44"
          />
          <Select
            value={stock}
            onChange={setStock}
            options={[
              { value: "all", label: "All stock" },
              { value: "in", label: "In stock" },
              { value: "out", label: "Out of stock" },
            ]}
            aria-label="Filter by stock"
            className="min-w-36"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
              <th className="px-4 py-2.5">Part</th>
              <th className="px-4 py-2.5">Category</th>
              <th className="px-4 py-2.5 text-right">Supplier cost</th>
              <th className="px-4 py-2.5 text-right">BMT price</th>
              <th className="px-4 py-2.5 text-right">Margin</th>
              <th className="px-4 py-2.5">Stock</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const gm = marginPct(p.supplier_cost_pence, p.bmt_price_pence);
              return (
                <tr
                  key={p.id}
                  className={cn(
                    "border-b border-border/60 last:border-0",
                    !p.is_active && "opacity-50",
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold text-text-primary">{p.name}</div>
                    <div className="font-mono text-xs text-text-muted">{p.sku}</div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{prettyCategory(p.category)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                    {formatPrice(p.supplier_cost_pence)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-text-primary">
                    {formatPrice(p.bmt_price_pence)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={gm >= 30 ? "text-green-700" : gm > 0 ? "text-amber-600" : "text-red-600"}>
                      {gm}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleStock(p)}
                      disabled={pending}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                        p.in_stock
                          ? "bg-green-50 text-green-700 hover:bg-green-100"
                          : "bg-red-50 text-red-700 hover:bg-red-100",
                      )}
                    >
                      {p.in_stock ? <PackageCheck size={13} /> : <PackageX size={13} />}
                      {p.in_stock ? "In stock" : "Out"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/parts/${p.id}/edit`}
                        className="inline-flex size-8 items-center justify-center rounded-button text-text-muted hover:bg-surface hover:text-text-primary"
                        aria-label={`Edit ${p.name}`}
                      >
                        <Pencil size={15} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => remove(p)}
                        disabled={pending}
                        className="inline-flex size-8 items-center justify-center rounded-button text-text-muted hover:bg-red-50 hover:text-red-600"
                        aria-label={`Delete ${p.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-text-muted">
                  No parts match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
