"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatPrice } from "@/lib/utils";
import { marginPence, marginPct, markupPct } from "@/lib/parts/margin";
import { createPart, updatePart } from "@/app/actions/parts";

export interface PartFormValues {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  supplier: string | null;
  description: string | null;
  supplier_cost_pence: number;
  bmt_price_pence: number;
  in_stock: boolean;
}

const FIELD_LABEL = "flex flex-col gap-1.5 text-sm font-semibold text-text-primary";
const FIELD_INPUT =
  "h-11 rounded-button border border-border bg-surface-card px-3.5 text-sm font-normal text-text-primary placeholder:text-text-disabled focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:opacity-50";

function poundsToPence(v: string): number {
  const n = Number.parseFloat(v.replace(/[£,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function PartForm({
  mode,
  part,
}: {
  mode: "create" | "edit";
  part?: PartFormValues;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(part?.name ?? "");
  const [sku, setSku] = useState(part?.sku ?? "");
  const [category, setCategory] = useState(part?.category ?? "");
  const [supplier, setSupplier] = useState(part?.supplier ?? "");
  const [description, setDescription] = useState(part?.description ?? "");
  const [costInput, setCostInput] = useState(
    part ? (part.supplier_cost_pence / 100).toFixed(2) : "",
  );
  const [priceInput, setPriceInput] = useState(
    part ? (part.bmt_price_pence / 100).toFixed(2) : "",
  );
  const [inStock, setInStock] = useState(part?.in_stock ?? true);

  // Live margin calculator.
  const costP = poundsToPence(costInput);
  const priceP = poundsToPence(priceInput);
  const margin = marginPence(costP, priceP);
  const gross = marginPct(costP, priceP);
  const markup = markupPct(costP, priceP);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const fd = new FormData();
        fd.set("name", name);
        fd.set("sku", sku);
        fd.set("category", category);
        fd.set("supplier", supplier);
        fd.set("description", description);
        fd.set("supplier_cost", costInput);
        fd.set("bmt_price", priceInput);
        if (inStock) fd.set("in_stock", "on");

        startTransition(async () => {
          const result =
            mode === "create" ? await createPart(fd) : await updatePart(part!.id, fd);
          if (result?.error) {
            setError(result.error);
            toast.error(result.error);
          }
        });
      }}
      className="space-y-6"
    >
      <Card className="space-y-5 p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className={FIELD_LABEL}>
            <span>Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={pending}
              placeholder="e.g. Front Brake Pads — Standard"
              className={FIELD_INPUT}
            />
          </label>
          <label className={FIELD_LABEL}>
            <span>SKU</span>
            <input
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value.toUpperCase())}
              disabled={pending}
              placeholder="Auto from name if blank"
              className={`${FIELD_INPUT} font-mono`}
            />
          </label>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className={FIELD_LABEL}>
            <span>Category</span>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
              disabled={pending}
              placeholder="e.g. brake_pads"
              className={FIELD_INPUT}
            />
            <span className="text-xs font-normal text-text-muted">
              Lower-case with underscores, e.g. <code>brake_pads</code>, <code>battery</code>.
            </span>
          </label>
          <label className={FIELD_LABEL}>
            <span>Supplier</span>
            <input
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              disabled={pending}
              placeholder="e.g. Euro Car Parts"
              className={FIELD_INPUT}
            />
          </label>
        </div>

        <label className={FIELD_LABEL}>
          <span>Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={pending}
            rows={2}
            placeholder="Optional."
            className={`${FIELD_INPUT} h-auto resize-y py-2.5`}
          />
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className={FIELD_LABEL}>
            <span>Supplier cost</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-text-muted">£</span>
              <input
                type="text"
                inputMode="decimal"
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                required
                disabled={pending}
                placeholder="18.00"
                className={`${FIELD_INPUT} pl-8`}
              />
            </div>
            <span className="text-xs font-normal text-text-muted">
              What BMT pays the supplier. Hidden from mechanics.
            </span>
          </label>
          <label className={FIELD_LABEL}>
            <span>BMT price</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-text-muted">£</span>
              <input
                type="text"
                inputMode="decimal"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                required
                disabled={pending}
                placeholder="32.00"
                className={`${FIELD_INPUT} pl-8`}
              />
            </div>
            <span className="text-xs font-normal text-text-muted">
              What BMT bills the mechanic / customer.
            </span>
          </label>
        </div>

        {/* Live margin calculator */}
        <div className="grid grid-cols-3 gap-3 rounded-button border border-border bg-surface p-4">
          <Stat label="Margin" value={formatPrice(margin)} />
          <Stat label="Gross margin" value={`${gross}%`} tone={gross >= 30 ? "good" : gross > 0 ? "ok" : "bad"} />
          <Stat label="Markup on cost" value={`${markup}%`} />
        </div>

        <label className="flex items-center gap-3 text-sm font-semibold text-text-primary">
          <input
            type="checkbox"
            checked={inStock}
            onChange={(e) => setInStock(e.target.checked)}
            disabled={pending}
            className="size-4 rounded border-border accent-brand-blue"
          />
          <span>In stock</span>
        </label>

        {error && (
          <p role="alert" className="rounded-button border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Link href="/admin/parts">
          <Button type="button" variant="ghost" disabled={pending}>
            Cancel
          </Button>
        </Link>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Create part" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "good" | "ok" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "text-green-700"
      : tone === "bad"
        ? "text-red-700"
        : tone === "ok"
          ? "text-amber-600"
          : "text-text-primary";
  return (
    <div>
      <div className="text-xs font-medium text-text-muted">{label}</div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}
