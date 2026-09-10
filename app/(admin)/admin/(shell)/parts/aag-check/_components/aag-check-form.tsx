"use client";

import { useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RegPlateInput } from "@/components/ui/reg-plate-input";
import { Select } from "@/components/ui/select";
import { AAG_EXAMPLE_GENARTS } from "@/lib/aag/types";
import { formatPrice } from "@/lib/utils";
import { checkAagQuoteAction, type AagCheckResult } from "@/app/actions/aag";

// Reg + product group in, AAG's priced parts and branch stock out. Read-only.

const OTHER = "other";
const GENART_OPTIONS = [
  ...AAG_EXAMPLE_GENARTS.map((g) => ({ value: g.id, label: `${g.label} (${g.id})` })),
  { value: OTHER, label: "Other GenArt id…" },
];

const FIELD_LABEL = "flex flex-col gap-1.5 text-sm font-semibold text-text-primary";
const FIELD_INPUT =
  "h-11 rounded-button border border-border bg-surface-card px-3.5 text-sm font-normal text-text-primary placeholder:text-text-disabled focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:opacity-50";

export function AagCheckForm({ disabled }: { disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [reg, setReg] = useState("");
  const [choice, setChoice] = useState<string>(AAG_EXAMPLE_GENARTS[0].id);
  const [other, setOther] = useState("");
  const [result, setResult] = useState<AagCheckResult | null>(null);

  const genart = choice === OTHER ? other.trim() : choice;

  return (
    <div className="space-y-6">
      <Card>
        <form
          className="grid gap-4 sm:grid-cols-[auto_1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              setResult(await checkAagQuoteAction({ reg, genart }));
            });
          }}
        >
          <label className={FIELD_LABEL}>
            Registration
            <RegPlateInput
              name="reg"
              value={reg}
              onChange={(e) => setReg(e.target.value)}
              disabled={disabled || pending}
              required
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={FIELD_LABEL}>
              Product group
              <Select value={choice} onChange={setChoice} options={GENART_OPTIONS} disabled={disabled || pending} aria-label="Product group" />
            </label>
            {choice === OTHER && (
              <label className={FIELD_LABEL}>
                TecDoc GenArt id
                <input
                  className={FIELD_INPUT}
                  inputMode="numeric"
                  placeholder="e.g. 82"
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                  disabled={disabled || pending}
                />
              </label>
            )}
          </div>
          <Button type="submit" variant="primary" iconLeft={Search} disabled={disabled || pending || !reg.trim() || !genart}>
            {pending ? "Asking AAG…" : "Get prices"}
          </Button>
        </form>
      </Card>

      {result && !result.ok && (
        <div className="rounded-button border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{result.error}</div>
      )}

      {result?.ok && <QuoteResult result={result} />}
    </div>
  );
}

function QuoteResult({ result }: { result: Extract<AagCheckResult, { ok: true }> }) {
  const v = result.vehicle;
  return (
    <Card padded={false}>
      <div className="border-b border-border px-6 py-4">
        <p className="text-sm text-text-muted">
          {result.sandbox ? "Sandbox" : "Live"} quote for <span className="font-semibold text-text-primary">{result.reg}</span> ·
          GenArt {result.genart} · {result.lines.length} product{result.lines.length === 1 ? "" : "s"}
        </p>
        {v && (
          <p className="mt-1 text-sm text-text-secondary">
            AAG identified: {[v.Make, v.Model].filter(Boolean).join(" ") || "unknown"}
            {v.EngineSize && <> · {v.EngineSize}cc</>}
            {v.Fuel && <> · {v.Fuel.toLowerCase()}</>}
            {v.YearOfManufacture && <> · {v.YearOfManufacture}</>}
            {v.Vin && <> · VIN {v.Vin}</>}
          </p>
        )}
      </div>

      {result.lines.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-text-muted">
          AAG answered but listed no products for this vehicle in that group.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-text-muted">
              <tr className="border-b border-border">
                <th className="px-6 py-2.5 font-semibold">Article</th>
                <th className="px-3 py-2.5 font-semibold">Product</th>
                <th className="px-3 py-2.5 font-semibold">Brand</th>
                <th className="px-3 py-2.5 text-right font-semibold">Cost</th>
                <th className="px-3 py-2.5 text-right font-semibold">Min</th>
                <th className="px-3 py-2.5 font-semibold">Stock</th>
              </tr>
            </thead>
            <tbody>
              {result.lines.map((line) => (
                <tr key={`${line.productId}-${line.requestLineId}`} className="border-b border-border-subtle align-top last:border-0">
                  <td className="px-6 py-3">
                    <div className="font-medium text-text-primary">{line.article}</div>
                    <div className="text-xs text-text-muted">
                      {[line.articleProvider, line.fittingPosition].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-text-secondary">
                    {line.productId}
                    {line.productId === result.cheapestProductId && (
                      <span className="ml-1.5 rounded-full bg-blue-50 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-brand-blue">cheapest</span>
                    )}
                    {!line.sellable && (
                      <span className="ml-1.5 rounded-full bg-red-50 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-red-700">locked out</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-text-primary">{line.brand ?? "—"}</div>
                    <div className="text-xs text-text-muted">{line.rating ?? ""}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-text-primary">
                    {line.costPence == null ? "—" : formatPrice(line.costPence)}
                    {line.surchargePence ? <div className="text-xs text-text-muted">+{formatPrice(line.surchargePence)} core</div> : null}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-text-secondary">{line.minOrderQty}</td>
                  <td className="px-3 py-3 text-xs text-text-secondary">
                    {line.stock.length === 0 ? (
                      "no locations listed"
                    ) : (
                      <ul className="space-y-0.5">
                        {line.stock.map((s, i) => (
                          <li key={`${s.locationId ?? i}`}>
                            <span className={s === line.quickest ? "font-semibold text-text-primary" : undefined}>{s.locationName}</span>
                            {s.locationType && <> ({s.locationType})</>} · {s.qty} in stock{s.eta && <> · {s.eta}</>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
