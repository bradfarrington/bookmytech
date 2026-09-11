"use client";

import { useCallback, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  lookupPartTypeAction,
  searchLkqComponentsAction,
  type PartTypeResult,
} from "@/app/actions/lkq";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Pill } from "@/components/ui/pill";
import { RegPlateInput } from "@/components/ui/reg-plate-input";
import { describeVehicle, type LkqVehicleSummary } from "@/lib/lkq/vehicle";
import { CatalogueBrowser } from "./catalogue-browser";

// Vehicle + part-type picker feeding the catalogue browser (Task 42).
//
// There is no "browse every part": LKQ's catalogue only answers "what fits this
// registration", and each part type is a metered credit. So the shape is —
// choose a vehicle, then pull part types from the full 2,277-component list one
// at a time, and they stack up into one filterable list.
//
// NOTHING FIRES ON MOUNT OR ON KEYSTROKE against the supplier. The component
// search runs against a checked-in list and costs nothing; only "Add" spends.

export function LiveLookupForm({ disabled }: { disabled: boolean }) {
  const [reg, setReg] = useState("");
  const [lockedReg, setLockedReg] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<LkqVehicleSummary | null>(null);
  const [componentLabel, setComponentLabel] = useState("");
  const [componentOptions, setComponentOptions] = useState<string[]>([]);
  const [results, setResults] = useState<PartTypeResult[]>([]);
  const [credits, setCredits] = useState<{ used: number; cap: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const onComponentQuery = useCallback((value: string) => {
    setComponentLabel(value);
    if (value.trim().length < 2) {
      setComponentOptions([]);
      return;
    }
    // Pure fixture search on the server — no supplier call, no credit.
    void searchLkqComponentsAction(value).then((hits) =>
      setComponentOptions(hits.map((h) => `${h.number} — ${h.name}`)),
    );
  }, []);

  function onAdd(event: React.FormEvent) {
    event.preventDefault();
    if (disabled || pending) return;

    const component = (componentLabel.split("—")[0] ?? "").trim();
    if (!reg.trim()) {
      toast.error("Enter a registration first.");
      return;
    }
    if (!component) {
      toast.error("Pick a part from the list.");
      return;
    }
    if (results.some((r) => r.component === component)) {
      toast.error("That part is already in the list.");
      return;
    }

    startTransition(async () => {
      const next = await lookupPartTypeAction({ reg, component });
      if (!next.ok) {
        toast.error(next.error);
        return;
      }
      // A different reg starts a fresh list — the parts are vehicle-specific.
      setResults((prev) => (lockedReg && lockedReg !== next.reg ? [] : prev).concat(next.result));
      setLockedReg(next.reg);
      setVehicle(next.vehicle);
      setCredits(next.credits);
      setComponentLabel("");
      setComponentOptions([]);
      if (next.result.rows.length === 0) {
        toast.info(`No ${next.result.componentName.toLowerCase()} listed for this vehicle.`);
      }
    });
  }

  const onRemove = useCallback((component: string) => {
    setResults((prev) => prev.filter((r) => r.component !== component));
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <form onSubmit={onAdd} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[auto_1fr_auto] sm:items-end">
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
                htmlFor="lkq-part"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted"
              >
                Part
              </label>
              <Combobox
                id="lkq-part"
                value={componentLabel}
                onChange={onComponentQuery}
                options={componentOptions}
                allowCustom={false}
                placeholder="Search LKQ's 2,277 parts…"
                disabled={disabled}
              />
            </div>

            <Button type="submit" variant="primary" iconLeft={Plus} disabled={disabled || pending}>
              {pending ? "Fetching…" : "Add to list"}
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
            <p>
              Parts are specific to a vehicle, so pick a registration first, then add as many
              part types as you need — they stack into one list you can filter.
            </p>
            {credits ? (
              <span className="whitespace-nowrap">
                {credits.used} of {credits.cap} catalogue credits used
              </span>
            ) : null}
          </div>
        </form>
      </Card>

      {lockedReg ? (
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-text-primary">
            {vehicle ? describeVehicle(vehicle) : lockedReg}
          </h2>
          <Pill tone="neutral">{lockedReg}</Pill>
          {vehicle?.engineCode ? <Pill tone="neutral">{vehicle.engineCode}</Pill> : null}
        </div>
      ) : null}

      <CatalogueBrowser results={results} onRemove={onRemove} />

      {results.length > 0 ? (
        <p className="text-xs text-text-muted">
          Prices are what BMT pays the supplier, passed through with no mark-up. Each supplier
          numbers the same part differently, so each column shows that supplier&apos;s own part
          number. Surcharges are listed separately and are <strong>not</strong> added to the
          cost — whether LKQ&apos;s price already includes them is still unconfirmed.
        </p>
      ) : null}
    </div>
  );
}
