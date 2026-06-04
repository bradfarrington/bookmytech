"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { importPartsCsv, type CsvImportResult } from "@/app/actions/parts";

const SAMPLE = `name,sku,category,supplier,supplier_cost,bmt_price,description
Front Brake Pads — Standard,BP-FRONT-STD,brake_pads,Euro Car Parts,18.00,32.00,Front axle pad set
12V Battery 060,BAT-060,battery,Yuasa,65.00,99.00,Type 060 54Ah`;

export function CsvImport() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<CsvImportResult | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(setText);
  }

  function run() {
    if (!text.trim()) {
      toast.error("Paste some CSV or choose a file first.");
      return;
    }
    startTransition(async () => {
      const res = await importPartsCsv(text);
      setResult(res);
      if (res.ok) {
        toast.success(`Imported: ${res.inserted} new, ${res.updated} updated.`);
        router.refresh();
      } else {
        toast.error("Nothing imported — check the errors below.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-text-primary">CSV data</span>
          <p className="text-xs text-text-muted">
            Header row required. Recognised columns:{" "}
            <code>name</code>, <code>sku</code>, <code>category</code>,{" "}
            <code>supplier</code>, <code>supplier_cost</code>,{" "}
            <code>bmt_price</code>, <code>description</code>. Prices accept{" "}
            <code>£18.00</code> or <code>1800</code> (pence). Rows upsert on SKU.
          </p>
        </div>

        <input
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          disabled={pending}
          className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-button file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm file:font-semibold file:text-text-primary hover:file:bg-border"
        />

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={pending}
          rows={10}
          placeholder={SAMPLE}
          className="w-full resize-y rounded-button border border-border bg-surface-card px-3.5 py-2.5 font-mono text-xs text-text-primary outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
        />

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setText(SAMPLE)}
            className="text-xs font-semibold text-brand-blue hover:underline"
          >
            Load sample
          </button>
          <Button variant="primary" onClick={run} disabled={pending}>
            {pending ? "Importing…" : "Import parts"}
          </Button>
        </div>
      </Card>

      {result && (
        <Card className="space-y-3 p-6">
          <h2 className="text-sm font-bold text-text-primary">Import summary</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            <Summary label="Inserted" value={result.inserted} tone="good" />
            <Summary label="Updated" value={result.updated} tone="good" />
            <Summary label="Skipped" value={result.skipped} tone={result.skipped ? "warn" : "neutral"} />
          </div>
          {result.errors.length > 0 && (
            <ul className="space-y-1 rounded-button border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {result.errors.slice(0, 20).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {result.errors.length > 20 && (
                <li>…and {result.errors.length - 20} more.</li>
              )}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "good" ? "text-green-700" : tone === "warn" ? "text-amber-600" : "text-text-primary";
  return (
    <div>
      <span className="text-xs font-medium text-text-muted">{label}</span>
      <div className={`text-xl font-bold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}
