"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { toast } from "sonner";

import {
  lookupSupplierPartsAction,
  lookupVehicleCatalogueAction,
  type SupplierLookupResult,
  type VehicleComponent,
} from "@/app/actions/lkq";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { RegPlateInput } from "@/components/ui/reg-plate-input";
import { describeVehicle, type LkqVehicleSummary } from "@/lib/lkq/vehicle";
import { cn, formatPrice } from "@/lib/utils";
import { SUPPLIER_LABEL } from "@/lib/parts/supplier-offer";
import { SupplierPanelCard } from "./supplier-panel-card";

// The supplier parts catalogue (Task 42).
//
// TWO STEPS, AND THE FIRST ONE IS THE CATALOGUE.
//   1. A registration returns everything LKQ lists for that vehicle — its own
//      2,277-component catalogue narrowed to the couple of hundred that fit (a
//      2007 Volvo S40 gives 211). At most two credits, cached 30 days.
//   2. Clicking a part prices it at both suppliers.
//
// There is deliberately NO curated category list: step 1 IS the catalogue, and
// it comes from LKQ rather than from us. Pricing every part up front would cost
// one credit each — most of a month's budget on a single car — so prices are
// fetched for the part you actually asked about.

export function LiveLookupForm({ disabled }: { disabled: boolean }) {
  const [reg, setReg] = useState("");
  const [lockedReg, setLockedReg] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<LkqVehicleSummary | null>(null);
  const [components, setComponents] = useState<VehicleComponent[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<VehicleComponent | null>(null);
  const [result, setResult] = useState<SupplierLookupResult | null>(null);
  const [credits, setCredits] = useState<{ used: number; cap: number } | null>(null);
  const [loadingVehicle, startVehicle] = useTransition();
  const [loadingPrices, startPrices] = useTransition();

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return components;
    return components.filter(
      (c) => c.name.toLowerCase().includes(q) || c.number.toLowerCase().includes(q),
    );
  }, [components, filter]);

  function onFindVehicle(event: React.FormEvent) {
    event.preventDefault();
    if (disabled || loadingVehicle) return;
    if (!reg.trim()) {
      toast.error("Enter a registration.");
      return;
    }

    startVehicle(async () => {
      const next = await lookupVehicleCatalogueAction({ reg });
      if (!next.ok) {
        toast.error(next.error);
        return;
      }
      setLockedReg(next.reg);
      setVehicle(next.vehicle);
      setComponents(next.components);
      setCredits(next.credits);
      setSelected(null);
      setResult(null);
      setFilter("");
    });
  }

  function onPickPart(component: VehicleComponent) {
    if (disabled || loadingPrices || !lockedReg) return;
    setSelected(component);
    setResult(null);

    startPrices(async () => {
      const next = await lookupSupplierPartsAction({
        reg: lockedReg,
        component: component.number,
      });
      setResult(next);
      if (!next.ok) toast.error(next.error);
      else setCredits(next.credits);
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <form onSubmit={onFindVehicle} className="flex flex-wrap items-end gap-4">
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

          <Button
            type="submit"
            variant="primary"
            iconLeft={Search}
            disabled={disabled || loadingVehicle}
          >
            {loadingVehicle ? "Looking up…" : "Show parts for this vehicle"}
          </Button>

          <p className="ml-auto text-xs text-text-muted">
            {credits ? `${credits.used} of ${credits.cap} catalogue credits used` : null}
          </p>
        </form>
      </Card>

      {lockedReg ? (
        <Card padded={false} className="overflow-hidden">
          <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <h2 className="mr-auto text-base font-semibold text-text-primary">
              {vehicle ? describeVehicle(vehicle) : lockedReg}
            </h2>
            <Pill tone="neutral">{lockedReg}</Pill>
            {vehicle?.engineCode ? <Pill tone="neutral">{vehicle.engineCode}</Pill> : null}
            <Pill tone="accent">{components.length} parts listed</Pill>
          </header>

          <div className="border-b border-border px-4 py-3">
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter this vehicle's parts…"
              aria-label="Filter parts"
              className="h-9 w-full rounded-md border border-border bg-surface-card px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>

          {visible.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-text-muted">
              Nothing matches &ldquo;{filter}&rdquo;.
            </p>
          ) : (
            <ul className="grid max-h-[22rem] gap-1 overflow-y-auto p-3 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((component) => {
                const active = selected?.number === component.number;
                return (
                  <li key={component.number}>
                    <button
                      type="button"
                      onClick={() => onPickPart(component)}
                      disabled={disabled || loadingPrices}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition",
                        active
                          ? "bg-brand-blue text-white"
                          : "text-text-primary hover:bg-border-subtle",
                        (disabled || loadingPrices) && !active && "opacity-60",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{component.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="border-t border-border px-4 py-2.5 text-xs text-text-muted">
            Everything LKQ lists for this vehicle. Pick one for live prices — a part you
            haven&apos;t priced on this vehicle before spends one credit, and is free after that.
          </p>
        </Card>
      ) : null}

      {loadingPrices && selected ? (
        <Card>
          <p className="text-sm text-text-muted">Asking both suppliers about {selected.name}…</p>
        </Card>
      ) : null}

      {result?.ok && !loadingPrices ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              iconLeft={ArrowLeft}
              onClick={() => {
                setSelected(null);
                setResult(null);
              }}
            >
              Back to the parts list
            </Button>
            <h3 className="text-base font-semibold text-text-primary">{result.group.label}</h3>
            {result.best ? (
              <div className="ml-auto text-right">
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
          </div>

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
            Costs are what BMT pays the supplier, passed through with no mark-up. Surcharges are
            shown separately and are <strong>not</strong> added to the cost — whether LKQ&apos;s
            price already includes them is still unconfirmed.
          </p>
        </div>
      ) : null}
    </div>
  );
}
