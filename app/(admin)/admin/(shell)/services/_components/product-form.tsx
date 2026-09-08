"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PRODUCT_CATEGORIES, type CatalogueProductRow, type ProductCategory } from "@/lib/catalogue/products";
import type { ChecklistRow } from "@/lib/checklists/checklists";
import { createProduct, updateProduct, type ProductInput } from "@/app/actions/catalogue-products";

const FIELD_LABEL = "flex flex-col gap-1.5 text-sm font-semibold text-text-primary";
const FIELD_INPUT =
  "h-11 rounded-button border border-border bg-surface-card px-3.5 text-sm font-normal text-text-primary placeholder:text-text-disabled focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:opacity-50";

function poundsToPence(v: string): number {
  const n = Number.parseFloat(v.replace(/[£,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

type Pricing = "fixed" | "hourly";

const TIER_OPTIONS = [
  { value: "", label: "Every item (no tier)" },
  { value: "bronze", label: "Bronze" },
  { value: "silver", label: "Silver" },
  { value: "gold", label: "Gold" },
];

export function ProductForm({
  mode,
  product,
  checklists = [],
}: {
  mode: "create" | "edit";
  product?: CatalogueProductRow;
  /** The checklists a product can carry (Task 32); empty before 0061. */
  checklists?: ChecklistRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [checklistId, setChecklistId] = useState(product?.checklist_id ?? "");
  const [checklistTier, setChecklistTier] = useState(product?.checklist_tier ?? "");
  const chosenChecklist = checklists.find((c) => c.id === checklistId) ?? null;

  const [category, setCategory] = useState<ProductCategory>(product?.category ?? "diagnostics");
  const [name, setName] = useState(product?.name ?? "");
  const [summary, setSummary] = useState(product?.summary ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [pricing, setPricing] = useState<Pricing>(product && product.price_pence == null ? "hourly" : "fixed");
  const [priceInput, setPriceInput] = useState(product?.price_pence != null ? (product.price_pence / 100).toFixed(2) : "");
  const [hoursInput, setHoursInput] = useState(product?.labour_hours != null ? String(Number(product.labour_hours)) : "");
  const [durationInput, setDurationInput] = useState(String(Number(product?.duration_hours ?? 1)));
  const [includesOil, setIncludesOil] = useState(product?.includes_engine_oil ?? category === "servicing");
  const [isActive, setIsActive] = useState(product?.is_active ?? true);

  function submit() {
    setError(null);
    const input: ProductInput = {
      category,
      name,
      summary,
      description,
      pricing,
      pricePence: pricing === "fixed" ? poundsToPence(priceInput) : null,
      labourHours: pricing === "hourly" ? Number(hoursInput) : null,
      durationHours: Number(durationInput),
      includesEngineOil: includesOil,
      isActive,
      checklistId: checklistId || null,
      checklistTier: chosenChecklist?.kind === "inspection" ? checklistTier || null : null,
    };
    startTransition(async () => {
      const result = mode === "create" ? await createProduct(input) : await updateProduct(product!.id, input);
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(mode === "create" ? "Product created." : "Product saved.");
      router.push("/admin/services");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-6"
    >
      <Card className="space-y-5 p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className={FIELD_LABEL}>
            <span>Category</span>
            <Select
              value={category}
              onChange={(next) => {
                setCategory(next);
                if (mode === "create") setIncludesOil(next === "servicing");
              }}
              options={PRODUCT_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
              aria-label="Category"
            />
          </label>
          <label className={FIELD_LABEL}>
            <span>Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={pending}
              placeholder="e.g. Full service"
              className={FIELD_INPUT}
            />
          </label>
        </div>

        <label className={FIELD_LABEL}>
          <span>Summary</span>
          <input
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            disabled={pending}
            placeholder="One line under the name, e.g. 56-point check with oil, oil filter and air filter"
            className={FIELD_INPUT}
          />
        </label>

        <label className={FIELD_LABEL}>
          <span>What&apos;s included</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={pending}
            rows={4}
            placeholder={"One item per line, e.g.\nEngine oil and oil filter replaced\nFluids checked and topped up"}
            className={`${FIELD_INPUT} h-auto resize-y py-2.5`}
          />
          <span className="text-xs font-normal text-text-muted">Shown on the price page, one bullet per line.</span>
        </label>

        <div className="grid gap-5 sm:grid-cols-3">
          <label className={FIELD_LABEL}>
            <span>Pricing</span>
            <Select<Pricing>
              value={pricing}
              onChange={setPricing}
              options={[
                { value: "fixed", label: "Fixed price" },
                { value: "hourly", label: "By the hour (× platform rate)" },
              ]}
              aria-label="Pricing"
            />
          </label>
          {pricing === "fixed" ? (
            <label className={FIELD_LABEL}>
              <span>Price</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-text-muted">£</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  required
                  disabled={pending}
                  placeholder="59.99"
                  className={`${FIELD_INPUT} pl-8`}
                />
              </div>
            </label>
          ) : (
            <label className={FIELD_LABEL}>
              <span>Labour hours</span>
              <input
                type="text"
                inputMode="decimal"
                value={hoursInput}
                onChange={(e) => setHoursInput(e.target.value)}
                required
                disabled={pending}
                placeholder="1.5"
                className={FIELD_INPUT}
              />
              <span className="text-xs font-normal text-text-muted">Charged at the hourly rate; 1-hour minimum per visit.</span>
            </label>
          )}
          <label className={FIELD_LABEL}>
            <span>Visit length (hours)</span>
            <input
              type="text"
              inputMode="decimal"
              value={durationInput}
              onChange={(e) => setDurationInput(e.target.value)}
              required
              disabled={pending}
              placeholder="1"
              className={FIELD_INPUT}
            />
            <span className="text-xs font-normal text-text-muted">How long the mechanic&apos;s calendar is blocked for.</span>
          </label>
        </div>

        {/* Checklist (Task 32) */}
        <div className="grid gap-5 sm:grid-cols-2">
          <label className={FIELD_LABEL}>
            <span>Checklist</span>
            <Select
              value={checklistId}
              onChange={setChecklistId}
              options={[
                { value: "", label: "None" },
                ...checklists.map((c) => ({ value: c.id, label: c.name })),
              ]}
              aria-label="Checklist"
            />
            <span className="text-xs font-normal text-text-muted">
              What the mechanic ticks through on the job; the customer gets it back as a report.
              {checklists.length === 0 && " No checklists exist yet — apply migration 0061."}
            </span>
          </label>
          {chosenChecklist?.kind === "inspection" && (
            <label className={FIELD_LABEL}>
              <span>Tier</span>
              <Select value={checklistTier} onChange={setChecklistTier} options={TIER_OPTIONS} aria-label="Checklist tier" />
              <span className="text-xs font-normal text-text-muted">Which of the inspection&apos;s items this product covers.</span>
            </label>
          )}
        </div>

        <div className="flex flex-col gap-4 rounded-button border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-text-primary">Includes engine oil</p>
            <p className="text-xs text-text-muted">
              Adds oil at the per-litre price × the manufacturer&apos;s capacity for the customer&apos;s car.
            </p>
          </div>
          <Switch checked={includesOil} onChange={setIncludesOil} label="Includes engine oil" disabled={pending} />
        </div>

        <div className="flex flex-col gap-4 rounded-button border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-text-primary">Live in the catalogue</p>
            <p className="text-xs text-text-muted">Switch off to hide it from customers without deleting it.</p>
          </div>
          <Switch checked={isActive} onChange={setIsActive} label="Live in the catalogue" disabled={pending} />
        </div>

        {error && (
          <p role="alert" className="rounded-button border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Link href="/admin/services">
          <Button type="button" variant="ghost" disabled={pending}>
            Cancel
          </Button>
        </Link>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Create product" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
