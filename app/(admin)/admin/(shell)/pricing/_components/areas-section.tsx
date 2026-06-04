"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createArea, updateArea, deleteArea } from "@/app/actions/pricing";
import { InlineNumber, InlineText } from "./inline-edit";
import { multiplier } from "./converters";

export interface AreaRowData {
  id: string;
  name: string;
  postcode_prefixes: string[];
  labour_multiplier: number;
  is_active: boolean;
}

const FIELD =
  "h-10 rounded-button border border-border bg-surface-card px-3 text-sm text-text-primary placeholder:text-text-disabled focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20";

export function AreasSection({ areas }: { areas: AreaRowData[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-text-primary">
            Area labour multipliers
          </h2>
          <p className="text-sm text-text-muted">
            Each area multiplies the labour portion by its factor, resolved by
            longest-matching postcode prefix. The Default area is the catch-all.
          </p>
        </div>
        <Button variant="secondary" size="sm" iconLeft={Plus} onClick={() => setAdding((v) => !v)}>
          Add area
        </Button>
      </div>

      {adding && <AddAreaForm onDone={() => setAdding(false)} />}

      <div className="overflow-hidden rounded-2xl border border-border bg-surface-card">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_120px_90px_56px] items-center gap-3 border-b border-border bg-surface px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
          <span>Name</span>
          <span>Postcode prefixes</span>
          <span>Multiplier</span>
          <span>Active</span>
          <span className="sr-only">Delete</span>
        </div>
        {areas.map((a) => (
          <AreaRow key={a.id} area={a} />
        ))}
      </div>
    </section>
  );
}

function AreaRow({ area }: { area: AreaRowData }) {
  const [pending, startTransition] = useTransition();
  const isDefault = area.name === "Default";

  function toggleActive() {
    const next = !area.is_active;
    startTransition(async () => {
      const res = await updateArea(area.id, { isActive: next });
      if (!res.ok) toast.error(res.error);
      else toast.success(next ? "Area activated." : "Area deactivated.");
    });
  }

  function remove() {
    if (!confirm(`Delete area "${area.name}"? This can't be undone.`)) return;
    startTransition(async () => {
      const res = await deleteArea(area.id);
      if (!res.ok) toast.error(res.error);
      else toast.success("Area deleted.");
    });
  }

  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_120px_90px_56px] items-center gap-3 border-b border-border-subtle px-5 py-2 text-sm last:border-b-0 ${pending ? "opacity-50" : ""}`}
    >
      <InlineText
        value={area.name}
        ariaLabel="Area name"
        onSave={(v) => updateArea(area.id, { name: v })}
      />
      <InlineText
        value={area.postcode_prefixes.join(", ")}
        placeholder={isDefault ? "Catch-all (no prefixes)" : "Add prefixes"}
        ariaLabel="Postcode prefixes (comma separated)"
        onSave={(v) =>
          updateArea(area.id, {
            prefixes: v.split(",").map((p) => p.trim()).filter(Boolean),
          })
        }
      />
      <InlineNumber
        value={area.labour_multiplier}
        {...multiplier}
        ariaLabel="Labour multiplier"
        onSave={(v) => updateArea(area.id, { multiplier: v ?? 1 })}
      />
      <button
        type="button"
        onClick={toggleActive}
        className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${area.is_active ? "bg-success" : "bg-border"}`}
        aria-label={area.is_active ? "Deactivate area" : "Activate area"}
        role="switch"
        aria-checked={area.is_active}
      >
        <span
          className={`block size-5 rounded-full bg-white transition-transform ${area.is_active ? "translate-x-5" : ""}`}
        />
      </button>
      {isDefault ? (
        <span className="text-center text-text-disabled" title="The Default area can't be deleted">
          —
        </span>
      ) : (
        <button
          type="button"
          onClick={remove}
          className="flex size-9 items-center justify-center rounded-button text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
          aria-label="Delete area"
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}

function AddAreaForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [prefixes, setPrefixes] = useState("");
  const [mult, setMult] = useState("1.000");
  const [pending, startTransition] = useTransition();

  function submit() {
    const m = Number(mult);
    if (!name.trim()) return toast.error("Enter an area name.");
    if (!Number.isFinite(m)) return toast.error("Enter a valid multiplier.");
    startTransition(async () => {
      const res = await createArea({
        name: name.trim(),
        prefixes: prefixes.split(",").map((p) => p.trim()).filter(Boolean),
        multiplier: m,
      });
      if (!res.ok) {
        toast.error(res.error);
      } else {
        toast.success("Area added.");
        onDone();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-text-muted">Name</span>
        <input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Birmingham" />
      </label>
      <label className="flex grow flex-col gap-1">
        <span className="text-xs font-semibold text-text-muted">Postcode prefixes</span>
        <input className={FIELD} value={prefixes} onChange={(e) => setPrefixes(e.target.value)} placeholder="B, WV, DY" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-text-muted">Multiplier</span>
        <input className={`${FIELD} w-28`} value={mult} onChange={(e) => setMult(e.target.value)} inputMode="decimal" />
      </label>
      <Button variant="primary" onClick={submit} disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </Button>
      <Button variant="ghost" onClick={onDone} disabled={pending}>
        Cancel
      </Button>
    </div>
  );
}
