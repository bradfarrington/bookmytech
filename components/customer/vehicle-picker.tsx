"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import {
  loadVehicleMakes,
  loadVehicleModels,
  loadVehicleTypes,
  selectVehicleManually,
} from "@/app/actions/vehicle-picker";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { makesMatch } from "@/lib/haynespro/make-match";
import type { PickerMake, PickerModel, PickerType } from "@/lib/haynespro/vehicle-picker";

// "That's not my car" — make → model → variant, off HaynesPro's own tree.
//
// This replaces a free-text make/model/year form that only ever changed the
// CAPTION: it threaded its answers through the URL and never reached the
// pricing engine, so the page showed the corrected car and kept charging for
// the guessed one. Choosing here writes the real car type into the vehicle
// cache, which every price on the site reads.
//
// The variant is the point. A registration resolves to a HaynesPro car type by
// fuzzy match, and the FORD Ranger alone lists three variants named "2.0
// (EcoBlue)" that differ only by engine code and power — with different labour
// times, and so different prices. That is what this lets someone fix.

interface VehiclePickerProps {
  reg: string;
  /** DVLA's make for this reg. The picker seeds itself with it — see below. */
  dvlaMake?: string | null;
  /**
   * Called after the correction is saved, with HaynesPro's name for the car.
   * Omitted — which is how a server component must render this, having no
   * function to pass — it refreshes the route instead. That is the right
   * default everywhere: every price on the page is derived from the cache row
   * the save just rewrote.
   */
  onSaved?: (description: string) => void;
  onCancel?: () => void;
  cancelLabel?: string;
}

export function VehiclePicker({
  reg,
  dvlaMake,
  onSaved,
  onCancel,
  cancelLabel = "Cancel",
}: VehiclePickerProps) {
  const router = useRouter();
  const [makes, setMakes] = useState<PickerMake[] | null>(null);
  const [models, setModels] = useState<PickerModel[] | null>(null);
  const [types, setTypes] = useState<PickerType[] | null>(null);

  const [makeId, setMakeId] = useState("");
  const [modelId, setModelId] = useState("");
  const [typeId, setTypeId] = useState("");

  const [loading, setLoading] = useState(true);
  const [outage, setOutage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  // Makes, once, on open — then seed the make from DVLA. DVLA is authoritative
  // on make (it is the variant that is ambiguous), and the server refuses a
  // correction whose make disagrees with it, so seeding is not a convenience:
  // it is the picker matching the rule it will be judged by. Only if DVLA's
  // make matches nothing in HaynesPro's list does the customer choose one.
  useEffect(() => {
    let live = true;
    loadVehicleMakes()
      .then((list) => {
        if (!live) return;
        if (!list) {
          setOutage(true);
          return;
        }
        setMakes(list);
        const seed = list.find((m) => makesMatch(dvlaMake, m.name));
        if (seed) setMakeId(String(seed.id));
      })
      .catch(() => live && setOutage(true))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [dvlaMake]);

  // Models follow the make; variants follow the model. Each level clears the
  // ones below it AT THE POINT OF CHOOSING, not in an effect — so there is no
  // render in which a stale variant is still selected under a new model, and a
  // half-changed selection can never be submitted.
  function chooseMake(id: string) {
    setMakeId(id);
    setModels(null);
    setModelId("");
    setTypes(null);
    setTypeId("");
    setError(null);
  }

  function chooseModel(id: string) {
    setModelId(id);
    setTypes(null);
    setTypeId("");
    setError(null);
  }

  useEffect(() => {
    if (!makeId) return;
    let live = true;
    loadVehicleModels(Number(makeId))
      .then((list) => live && (list ? setModels(list) : setOutage(true)))
      .catch(() => live && setOutage(true));
    return () => {
      live = false;
    };
  }, [makeId]);

  useEffect(() => {
    if (!modelId) return;
    let live = true;
    loadVehicleTypes(Number(modelId))
      .then((list) => live && (list ? setTypes(list) : setOutage(true)))
      .catch(() => live && setOutage(true));
    return () => {
      live = false;
    };
  }, [modelId]);

  const seededMake = makes?.find((m) => String(m.id) === makeId);
  const makeIsFromDvla = Boolean(seededMake && makesMatch(dvlaMake, seededMake.name));

  function save() {
    setError(null);
    startSaving(async () => {
      const result = await selectVehicleManually(reg, Number(typeId));
      if (result.ok) {
        if (onSaved) onSaved(result.vehicle.description);
        else router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  if (outage) {
    return (
      <Notice>
        We can&apos;t load the vehicle list at the moment — that&apos;s a problem on our
        side, not with your registration. Please try again a little later, or get in
        touch and we&apos;ll sort it for you.
      </Notice>
    );
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-text-secondary">
        <Loader2 size={16} className="animate-spin text-brand-blue" />
        Loading vehicle list…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {makeIsFromDvla ? (
        // Fixed, not a dropdown: a correction to a different make is refused by
        // the server, so offering the choice would be offering a dead end.
        <Field label="Make">
          <div className="flex h-12 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text-primary">
            <Check size={15} className="text-success" />
            {seededMake?.name}
            <span className="font-normal text-text-muted">· from DVLA</span>
          </div>
        </Field>
      ) : (
        <Field label="Make">
          <Select
            value={makeId}
            onChange={chooseMake}
            options={(makes ?? []).map((m) => ({ value: String(m.id), label: m.name }))}
            placeholder="Choose a make"
            aria-label="Make"
          />
        </Field>
      )}

      <Field label="Model">
        <Select
          value={modelId}
          onChange={chooseModel}
          options={(models ?? []).map((m) => ({
            value: String(m.id),
            label: modelLabel(m),
          }))}
          placeholder={
            !makeId ? "Choose a make first" : models ? "Choose a model" : "Loading…"
          }
          disabled={!models || models.length === 0}
          aria-label="Model"
        />
      </Field>

      <Field
        label="Engine / variant"
        hint="This is what sets the price — check the engine size and power match your car."
      >
        <Select
          value={typeId}
          onChange={setTypeId}
          options={(types ?? []).map((t) => ({
            value: String(t.id),
            label: typeLabel(t),
          }))}
          placeholder={
            !modelId ? "Choose a model first" : types ? "Choose a variant" : "Loading…"
          }
          disabled={!types || types.length === 0}
          aria-label="Engine or variant"
        />
      </Field>

      {models?.length === 0 && (
        <Notice>We don&apos;t have any models listed for that make.</Notice>
      )}
      {types?.length === 0 && (
        <Notice>We don&apos;t have any variants listed for that model.</Notice>
      )}
      {error && <Notice>{error}</Notice>}

      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={save}
          disabled={!typeId || saving}
          iconLeft={saving ? Loader2 : undefined}
        >
          {saving ? "Saving…" : "Use this vehicle"}
        </Button>
        {onCancel && (
          <Button variant="secondary" size="lg" fullWidth onClick={onCancel} disabled={saving}>
            {cancelLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

/** "Ranger (2011–2023)" — four Fords are called "Ranger"; the years separate them. */
function modelLabel(model: PickerModel): string {
  const years = yearRange(model.madeFrom, model.madeUntil);
  return years ? `${model.name} (${years})` : model.name;
}

/** "2.0 (EcoBlue) · 1996 cc · 168 bhp · 2019–2022" — everything that tells two apart. */
function typeLabel(type: PickerType): string {
  const parts = [type.name];
  if (type.capacity) parts.push(`${type.capacity} cc`);
  if (type.outputBhp) parts.push(`${type.outputBhp} bhp`);
  const years = yearRange(type.madeFrom, type.madeUntil);
  if (years) parts.push(years);
  return parts.join(" · ");
}

function yearRange(from: string | null, until: string | null): string | null {
  const start = from?.slice(0, 4);
  const end = until?.slice(0, 4);
  if (!start && !end) return null;
  if (start && !end) return `${start}–on`;
  if (!start) return `to ${end}`;
  return start === end ? start! : `${start}–${end}`;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-text-primary">{label}</label>
      {children}
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
      <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-600" />
      <p className="text-sm text-amber-900">{children}</p>
    </div>
  );
}
