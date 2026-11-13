import { Info } from "lucide-react";
import { parseInfoSheet } from "@/lib/catalogue/products";

// What a customer must read before booking a product that has an info sheet
// (Task 74) — the DPF clean's process and its "charged whether or not the
// filter clears" terms. Shown under the price for every such product in the
// basket, before "Pick a time", so it is read before paying, not after.

export interface ProductInfoSheet {
  id: string;
  name: string;
  infoSheet: string;
}

export function ProductInfoSheets({ sheets }: { sheets: ProductInfoSheet[] }) {
  if (sheets.length === 0) return null;
  return (
    <div className="flex flex-col gap-4">
      {sheets.map((sheet) => (
        <section
          key={sheet.id}
          aria-label={`About ${sheet.name}`}
          className="rounded-2xl border border-border bg-surface-card p-5 shadow-card"
        >
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-blue">
            <Info size={14} strokeWidth={2.5} />
            Please read before you book
          </p>
          <h2 className="mt-1 text-lg font-bold text-text-primary">{sheet.name}</h2>
          <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-text-secondary">
            {parseInfoSheet(sheet.infoSheet).map((block, index) =>
              block.type === "heading" ? (
                <h3 key={index} className="pt-1 text-sm font-bold text-text-primary">
                  {block.text}
                </h3>
              ) : block.type === "bullets" ? (
                <ul key={index} className="flex list-disc flex-col gap-1 pl-5">
                  {block.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p key={index}>{block.text}</p>
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
