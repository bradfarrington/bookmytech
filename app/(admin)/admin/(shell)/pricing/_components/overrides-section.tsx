"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { formatPrice, parsePrice } from "@/lib/utils";
import { upsertServiceAreaPrice } from "@/app/actions/pricing";
import { percent } from "./converters";

export interface CellData {
  service_id: string;
  area_id: string;
  override_price_pence: number | null;
  parts_price_pence: number | null;
  commission_rate: number | null;
}

interface NamedRow {
  id: string;
  name: string;
}

const FIELD =
  "h-10 rounded-button border border-border bg-surface-card px-3 text-sm text-text-primary placeholder:text-text-disabled focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20";

export function OverridesSection({
  services,
  areas,
  cells,
}: {
  services: NamedRow[];
  areas: NamedRow[];
  cells: CellData[];
}) {
  const cellMap = useMemo(() => {
    const m = new Map<string, CellData>();
    for (const c of cells) m.set(`${c.service_id}:${c.area_id}`, c);
    return m;
  }, [cells]);

  const serviceName = useMemo(
    () => new Map(services.map((s) => [s.id, s.name])),
    [services],
  );
  const areaName = useMemo(() => new Map(areas.map((a) => [a.id, a.name])), [areas]);

  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const [override, setOverride] = useState("");
  const [parts, setParts] = useState("");
  const [commission, setCommission] = useState("");
  const [pending, startTransition] = useTransition();

  // Pre-fill the fields from the selected cell.
  function loadCell(sId: string, aId: string) {
    const c = cellMap.get(`${sId}:${aId}`);
    setOverride(c?.override_price_pence != null ? (c.override_price_pence / 100).toFixed(2) : "");
    setParts(c?.parts_price_pence != null ? (c.parts_price_pence / 100).toFixed(2) : "");
    setCommission(c?.commission_rate != null ? String(Math.round(c.commission_rate * 1000) / 10) : "");
  }

  function onPickService(v: string) {
    setServiceId(v);
    loadCell(v, areaId);
  }
  function onPickArea(v: string) {
    setAreaId(v);
    loadCell(serviceId, v);
  }

  function save() {
    if (!serviceId || !areaId) return;
    const overridePence = override.trim() === "" ? null : parsePrice(override);
    const partsPence = parts.trim() === "" ? null : parsePrice(parts);
    const commissionRate = commission.trim() === "" ? null : percent.parse(commission);
    if (override.trim() !== "" && overridePence == null) return toast.error("Invalid override price.");
    if (parts.trim() !== "" && partsPence == null) return toast.error("Invalid parts price.");
    if (commission.trim() !== "" && commissionRate == null) return toast.error("Invalid commission.");

    startTransition(async () => {
      const res = await upsertServiceAreaPrice({
        serviceId,
        areaId,
        overridePence,
        partsPence,
        commissionRate,
      });
      if (!res.ok) toast.error(res.error);
      else toast.success("Override saved.");
    });
  }

  const withOverride = cells.filter((c) => c.override_price_pence != null);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-text-primary">
          Service / area overrides &amp; parts
        </h2>
        <p className="text-sm text-text-muted">
          Set a fixed override price (replaces base × multiplier), a dummy parts
          cost, and an optional commission for a specific service in a specific
          area. Blank fields fall back to the defaults.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface-card p-4">
        <label className="flex min-w-44 grow flex-col gap-1">
          <span className="text-xs font-semibold text-text-muted">Service</span>
          <Select
            value={serviceId}
            onChange={onPickService}
            options={services.map((s) => ({ value: s.id, label: s.name }))}
            aria-label="Service"
          />
        </label>
        <label className="flex min-w-40 flex-col gap-1">
          <span className="text-xs font-semibold text-text-muted">Area</span>
          <Select
            value={areaId}
            onChange={onPickArea}
            options={areas.map((a) => ({ value: a.id, label: a.name }))}
            aria-label="Area"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-text-muted">Override £</span>
          <input className={`${FIELD} w-28`} value={override} onChange={(e) => setOverride(e.target.value)} placeholder="—" inputMode="decimal" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-text-muted">Parts £</span>
          <input className={`${FIELD} w-28`} value={parts} onChange={(e) => setParts(e.target.value)} placeholder="—" inputMode="decimal" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-text-muted">Commission %</span>
          <input className={`${FIELD} w-28`} value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="Default" inputMode="decimal" />
        </label>
        <Button variant="primary" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>

      {withOverride.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface-card">
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_120px] gap-3 border-b border-border bg-surface px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
            <span>Service</span>
            <span>Area</span>
            <span>Override</span>
            <span>Parts</span>
          </div>
          {withOverride.map((c) => (
            <div
              key={`${c.service_id}:${c.area_id}`}
              className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_120px] gap-3 border-b border-border-subtle px-5 py-2 text-sm tabular-nums last:border-b-0"
            >
              <span className="font-medium text-text-primary">{serviceName.get(c.service_id) ?? "—"}</span>
              <span className="text-text-secondary">{areaName.get(c.area_id) ?? "—"}</span>
              <span>{formatPrice(c.override_price_pence ?? 0)}</span>
              <span>{c.parts_price_pence != null ? formatPrice(c.parts_price_pence) : "—"}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
