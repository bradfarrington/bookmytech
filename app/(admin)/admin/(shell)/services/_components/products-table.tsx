"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Droplets, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn, formatPrice } from "@/lib/utils";
import type { CatalogueProductRow } from "@/lib/catalogue/products";
import { deleteProduct, reorderProduct, setProductActive } from "@/app/actions/catalogue-products";

export function ProductsTable({ products }: { products: CatalogueProductRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) toast.error(res.error ?? "Something went wrong.");
      else {
        if (success) toast.success(success);
        router.refresh();
      }
    });
  }

  if (products.length === 0) {
    return (
      <Card className="px-4 py-8 text-center text-sm text-text-muted">
        Nothing here yet — add a product and it appears in the catalogue at once.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
              <th className="w-20 px-4 py-2.5">Order</th>
              <th className="px-4 py-2.5">Product</th>
              <th className="px-4 py-2.5 text-right">Price</th>
              <th className="px-4 py-2.5 text-right">Visit</th>
              <th className="px-4 py-2.5">Live</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, index) => (
              <tr key={p.id} className={cn("border-b border-border/60 last:border-0", !p.is_active && "opacity-60")}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      disabled={pending || index === 0}
                      onClick={() => run(() => reorderProduct(p.id, "up"))}
                      className="inline-flex size-7 items-center justify-center rounded-button text-text-muted hover:bg-surface hover:text-text-primary disabled:opacity-30"
                      aria-label={`Move ${p.name} up`}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={pending || index === products.length - 1}
                      onClick={() => run(() => reorderProduct(p.id, "down"))}
                      className="inline-flex size-7 items-center justify-center rounded-button text-text-muted hover:bg-surface hover:text-text-primary disabled:opacity-30"
                      aria-label={`Move ${p.name} down`}
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-text-primary">{p.name}</div>
                  {p.summary && <div className="text-xs text-text-muted">{p.summary}</div>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <div className="font-semibold text-text-primary">
                    {p.price_pence != null
                      ? formatPrice(p.price_pence)
                      : `${Number(p.labour_hours ?? 0)} h × rate`}
                  </div>
                  {p.includes_engine_oil && (
                    <div className="flex items-center justify-end gap-1 text-xs text-text-muted">
                      <Droplets size={12} />
                      + engine oil
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                  {Number(p.duration_hours ?? 1)} h
                </td>
                <td className="px-4 py-3">
                  <Switch
                    checked={p.is_active}
                    disabled={pending}
                    size="sm"
                    label={`${p.name} live in the catalogue`}
                    onChange={(next) =>
                      run(
                        () => setProductActive(p.id, next),
                        next ? `${p.name} is live.` : `${p.name} is hidden from customers.`,
                      )
                    }
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/services/${p.id}/edit`}
                      className="inline-flex size-8 items-center justify-center rounded-button text-text-muted hover:bg-surface hover:text-text-primary"
                      aria-label={`Edit ${p.name}`}
                    >
                      <Pencil size={15} />
                    </Link>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(`Delete "${p.name}"? This can't be undone.`)) return;
                        run(() => deleteProduct(p.id), "Product deleted.");
                      }}
                      className="inline-flex size-8 items-center justify-center rounded-button text-text-muted hover:bg-red-50 hover:text-red-600"
                      aria-label={`Delete ${p.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
