"use client";

import { useState, useTransition } from "react";
import { Info, Search } from "lucide-react";
import { toast } from "sonner";

import {
  lookupSupplierPartsAction,
  searchLkqComponentsAction,
  type SupplierLookupResult,
} from "@/app/actions/lkq";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Pill } from "@/components/ui/pill";
import { RegPlateInput } from "@/components/ui/reg-plate-input";
import { Select } from "@/components/ui/select";
import { PART_GROUPS } from "@/lib/lkq/mapping";
import { describeVehicle } from "@/lib/lkq/vehicle";
import { formatPrice } from "@/lib/utils";
import { SUPPLIER_LABEL } from "@/lib/parts/supplier-offer";
import { SupplierPanelCard } from "./supplier-panel-card";

// The live lookup (Task 42).
//
// NOTHING FIRES ON MOUNT OR ON KEYSTROKE. Every search can spend a metered
// catalogue credit, so it takes one deliberate button press. The component
// search is the exception — it runs against a checked-in list, never the network.

type Mode = "compare" | "lkq";

const MODES: ReadonlyArray<{ value: Mode; label: string }> = [
  { value: "compare", label: "Compare both suppliers" },
  { value: "lkq", label: "Any LKQ component (LKQ only)" },
];

export function LiveLookupForm({ disabled }: { disabled: boolean }) {
  const [reg, setReg] = useState("");
  const [mode, setMode] = useState<Mode>("compare");
  const [groupKey, setGroupKey] = useState(PART_GROUPS[0].key);
  const [componentLabel, setComponentLabel] = useState("");
  const [componentOptions, setComponentOptions] = useState<string[]>([]);
  const [result, setResult] = useState<SupplierLookupResult | null>(null);
  const [pending, startTransition] = useTransition();

  function onComponentQuery(value: string) {
    setComponentLabel(value);
    if (value.trim().length < 2) {
      setComponentOptions([]);
      return;
    }
    // Pure fixture search on the server — no network call to LKQ, no credit.
    void searchLkqComponentsAction(value).then((hits) =>
      setComponentOptions(hits.map((h) => `${h.number} — ${h.name}`)),
    );
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (disabled || pending) return;

    const component =
      mode === "lkq" ? (componentLabel.split("—")[0] ?? "").trim() : undefined;

    if (mode === "lkq" && !component) {
      toast.error("Pick a component from the list.");
      return;
    }

    startTransition(async () => {
      const next = await lookupSupplierPartsAction({
        reg,
        groupKey: mode === "compare" ? groupKey : undefined,
        component,
      });
      setResult(next);
      if (!next.ok) toast.error(next.error);
    });
  }

  const group = result?.ok ? result.group : null;

  return (
    <div className="space-y-6">
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-end">
            <div>
              <label
                htmlFor="lkq-reg"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted"
              >
                Registration
              </label>
              <RegPlateInput
                id="lkq-reg"
                value={reg}
                onChange={(e) => setReg(e.target.value)}
                disabled={disabled}
              />
            </div>

            <div>
              <label
                htmlFor="lkq-mode"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted"
              >
                Look up
              </label>
              <Select<Mode>
                id="lkq-mode"
                value={mode}
                onChange={setMode}
                options={MODES}
                disabled={disabled}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label
                htmlFor="lkq-part"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted"
              >
                {mode === "compare" ? "Part" : "LKQ component"}
              </label>
              {mode === "compare" ? (
                <Select
                  id="lkq-part"
                  value={groupKey}
                  onChange={setGroupKey}
                  options={PART_GROUPS.map((g) => ({ value: g.key, label: g.label }))}
                  disabled={disabled}
                />
              ) : (
                <Combobox
                  id="lkq-part"
                  value={componentLabel}
                  onChange={onComponentQuery}
                  options={componentOptions}
                  allowCustom={false}
                  placeholder="Search 2,277 LKQ components…"
                  disabled={disabled}
                />
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              iconLeft={Search}
              disabled={disabled || pending}
            >
              {pending ? "Asking suppliers…" : "Get prices"}
            </Button>
          </div>

          {mode === "compare" ? (
            <p className="text-xs text-text-muted">
              These eight are the parts we can price with{" "}
              <strong className="font-semibold text-text-primary">both</strong> suppliers —
              LKQ and Alliance Automotive use different product-group numbering, and these
              are the pairs we&apos;ve matched up. To search{" "}
              <button
                type="button"
                onClick={() => setMode("lkq")}
                className="font-semibold text-brand-blue hover:underline"
              >
                LKQ&apos;s full catalogue of 2,277 parts
              </button>
              , switch &ldquo;Look up&rdquo; above — Alliance can&apos;t be asked about those.
            </p>
          ) : (
            <p className="text-xs text-text-muted">
              Searching all 2,277 LKQ components. Alliance Automotive has no matching product
              group for these, so only the LKQ column will fill.
            </p>
          )}

          <p className="text-xs text-text-muted">
            Each new vehicle or new product group spends one catalogue credit. Prices and
            stock are fetched live every time and cost nothing.
          </p>
        </form>
      </Card>

      {result?.ok && group ? (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-text-primary">
                  {result.vehicle ? describeVehicle(result.vehicle) : result.reg}
                </h2>
                <Pill tone="neutral">{group.label}</Pill>
                {group.confidence === "assumed" ? (
                  <Pill tone="pending">Mapping unconfirmed</Pill>
                ) : null}
              </div>
              {group.note ? (
                <p className="mt-1 flex items-start gap-1 text-xs text-amber-700">
                  <Info aria-hidden className="mt-0.5 size-3 shrink-0" />
                  {group.note}
                </p>
              ) : null}
            </div>

            {result.best ? (
              <div className="text-right">
                <div className="text-xs uppercase tracking-wide text-text-muted">
                  Cheapest across suppliers
                </div>
                <div className="text-lg font-bold text-text-primary">
                  {formatPrice(result.best.costPence)}
                </div>
                <div className="text-xs text-text-muted">
                  {SUPPLIER_LABEL[result.best.supplier]} ·{" "}
                  <span className="font-mono">{result.best.partNumber}</span>
                </div>
              </div>
            ) : null}
          </Card>

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <SupplierPanelCard
              supplier="lkq"
              panel={result.lkq}
              bestPartNumber={result.best?.partNumber ?? null}
              bestSupplier={result.best?.supplier ?? null}
            />
            <SupplierPanelCard
              supplier="aag"
              panel={result.aag}
              bestPartNumber={result.best?.partNumber ?? null}
              bestSupplier={result.best?.supplier ?? null}
            />
          </div>

          <p className="text-xs text-text-muted">
            Costs are what BMT pays the supplier, passed through with no mark-up. Surcharges
            are shown separately and are <strong>not</strong> added to the cost — whether
            LKQ&apos;s price already includes them is still unconfirmed.
          </p>
        </div>
      ) : null}
    </div>
  );
}
