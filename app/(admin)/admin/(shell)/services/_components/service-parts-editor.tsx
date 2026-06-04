"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { formatPrice } from "@/lib/utils";
import {
  attachServicePart,
  setServicePartQuantity,
  detachServicePart,
} from "@/app/actions/parts";

export interface AttachedPart {
  id: string; // service_parts row id
  partId: string;
  name: string;
  sku: string | null;
  quantity: number;
  unitPricePence: number;
}

export interface CataloguePart {
  id: string;
  name: string;
  sku: string | null;
  bmtPricePence: number;
}

// Manages which catalogue parts a service requires. Bookings of this service
// snapshot these as line items (at the BMT price) and add them to the customer
// total — "the service knows it needs parts".
export function ServicePartsEditor({
  serviceId,
  attached,
  catalogue,
}: {
  serviceId: string;
  attached: AttachedPart[];
  catalogue: CataloguePart[];
}) {
  const [pending, startTransition] = useTransition();
  const [pickPartId, setPickPartId] = useState("");
  const [pickQty, setPickQty] = useState("1");

  // Parts not already attached are addable.
  const attachedIds = useMemo(() => new Set(attached.map((a) => a.partId)), [attached]);
  const addable = catalogue.filter((c) => !attachedIds.has(c.id));

  const total = attached.reduce((s, p) => s + p.unitPricePence * p.quantity, 0);

  function add() {
    if (!pickPartId) {
      toast.error("Pick a part to add.");
      return;
    }
    startTransition(async () => {
      const res = await attachServicePart(serviceId, pickPartId, Number(pickQty) || 1);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Part added.");
        setPickPartId("");
        setPickQty("1");
      }
    });
  }

  function changeQty(rowId: string, qty: number) {
    startTransition(async () => {
      const res = await setServicePartQuantity(rowId, serviceId, qty);
      if (res?.error) toast.error(res.error);
    });
  }

  function remove(rowId: string) {
    startTransition(async () => {
      const res = await detachServicePart(rowId, serviceId);
      if (res?.error) toast.error(res.error);
      else toast.success("Part removed.");
    });
  }

  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Package size={16} className="text-brand-blue" />
        <h2 className="text-sm font-bold tracking-tight text-text-primary">
          Required parts
        </h2>
      </div>
      <p className="text-xs text-text-muted">
        Parts added here are billed to the customer (at the BMT price) and shown
        itemised in the booking flow. Mechanics choose to source them or order
        via BMT on the job.
      </p>

      {attached.length > 0 ? (
        <ul className="divide-y divide-border/60 rounded-button border border-border">
          {attached.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-text-primary">{p.name}</div>
                <div className="font-mono text-xs text-text-muted">{p.sku}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-muted">Qty</span>
                <input
                  type="number"
                  min={1}
                  defaultValue={p.quantity}
                  disabled={pending}
                  onBlur={(e) => {
                    const q = Math.max(1, Number(e.target.value) || 1);
                    if (q !== p.quantity) changeQty(p.id, q);
                  }}
                  className="h-9 w-16 rounded-button border border-border bg-surface-card px-2 text-sm tabular-nums text-text-primary outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
                />
              </div>
              <div className="w-20 text-right text-sm font-semibold tabular-nums text-text-primary">
                {formatPrice(p.unitPricePence * p.quantity)}
              </div>
              <button
                type="button"
                onClick={() => remove(p.id)}
                disabled={pending}
                aria-label={`Remove ${p.name}`}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-button text-text-muted hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
          <li className="flex items-center justify-between px-3 py-2.5 text-sm">
            <span className="font-semibold text-text-secondary">Parts total</span>
            <span className="font-bold tabular-nums text-text-primary">{formatPrice(total)}</span>
          </li>
        </ul>
      ) : (
        <p className="rounded-button border border-dashed border-border px-3 py-6 text-center text-sm text-text-muted">
          No parts configured. This service is billed at labour only.
        </p>
      )}

      {/* Add row */}
      <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Select
            value={pickPartId}
            onChange={setPickPartId}
            options={addable.map((c) => ({
              value: c.id,
              label: `${c.name} — ${formatPrice(c.bmtPricePence)}`,
            }))}
            placeholder={addable.length ? "Choose a part to add…" : "All catalogue parts added"}
            aria-label="Add a part"
          />
        </div>
        <input
          type="number"
          min={1}
          value={pickQty}
          onChange={(e) => setPickQty(e.target.value)}
          aria-label="Quantity"
          className="h-11 w-20 rounded-button border border-border bg-surface-card px-3 text-sm tabular-nums text-text-primary outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
        />
        <Button type="button" variant="secondary" iconLeft={Plus} onClick={add} disabled={pending || !addable.length}>
          Add
        </Button>
      </div>
    </Card>
  );
}
