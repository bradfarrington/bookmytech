"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn, formatPrice } from "@/lib/utils";
import { promoOfferLabel, type PromoCodeRow } from "@/lib/promos/validate";
import { setPromoCodeActive } from "@/app/actions/discounts";

export interface DiscountRow extends PromoCodeRow {
  /** Redemptions that count against the cap (redeemed, or reserved and unexpired). */
  used: number;
  /** How many times it has been sent to a customer. */
  sent: number;
}

function windowLabel(code: DiscountRow): string {
  const from = new Date(code.starts_at);
  const started = from.getTime() <= Date.now();
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (!code.expires_at) return started ? "No end date" : `From ${fmt(from)}`;
  const to = new Date(code.expires_at);
  const expired = to.getTime() <= Date.now();
  return `${started ? "Until" : `${fmt(from)} –`} ${fmt(to)}${expired ? " (expired)" : ""}`;
}

export function DiscountsTable({ codes }: { codes: DiscountRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (codes.length === 0) {
    return (
      <Card className="px-4 py-10 text-center text-sm text-text-muted">
        No discount codes yet. Create one and send it to your repeat customers.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
              <th className="px-4 py-2.5">Code</th>
              <th className="px-4 py-2.5">Offer</th>
              <th className="px-4 py-2.5">Window</th>
              <th className="px-4 py-2.5 text-right">Used</th>
              <th className="px-4 py-2.5 text-right">Sent</th>
              <th className="px-4 py-2.5">Live</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.id} className={cn("border-b border-border/60 last:border-0", !c.is_active && "opacity-60")}>
                <td className="px-4 py-3">
                  <Link href={`/admin/discounts/${c.id}`} className="font-mono font-bold text-text-primary hover:text-brand-blue">
                    {c.code}
                  </Link>
                  {c.description && <div className="text-xs text-text-muted">{c.description}</div>}
                </td>
                <td className="px-4 py-3 font-semibold text-text-primary">
                  {promoOfferLabel(c)}
                  {c.min_total_pence > 0 && (
                    <div className="text-xs font-normal text-text-muted">
                      on bookings over {formatPrice(c.min_total_pence)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-text-secondary">{windowLabel(c)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                  {c.used}
                  {c.max_redemptions != null ? ` / ${c.max_redemptions}` : ""}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-text-secondary">{c.sent}</td>
                <td className="px-4 py-3">
                  <Switch
                    checked={c.is_active}
                    disabled={pending}
                    size="sm"
                    label={`${c.code} live`}
                    onChange={(next) =>
                      startTransition(async () => {
                        const res = await setPromoCodeActive(c.id, next);
                        if (!res.ok) toast.error(res.error);
                        else {
                          toast.success(next ? `${c.code} is live.` : `${c.code} is switched off.`);
                          router.refresh();
                        }
                      })
                    }
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end">
                    <Link
                      href={`/admin/discounts/${c.id}`}
                      className="inline-flex size-8 items-center justify-center rounded-button text-text-muted hover:bg-surface hover:text-text-primary"
                      aria-label={`Edit ${c.code}`}
                    >
                      <Pencil size={15} />
                    </Link>
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
