import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Overline } from "@/components/ui/overline";
import { formatPrice } from "@/lib/utils";
import { promoOfferLabel, type PromoCodeRow } from "@/lib/promos/validate";
import { DiscountForm } from "../_components/discount-form";
import { SendPanel } from "../_components/send-panel";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  reserved: "At checkout",
  redeemed: "Used",
  released: "Given back",
};

export default async function AdminDiscountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();
  const { data: code } = await admin
    .from("promo_codes")
    .select(
      "id, code, kind, value, description, starts_at, expires_at, max_redemptions, per_customer_limit, min_total_pence, is_active",
    )
    .eq("id", id)
    .maybeSingle();
  if (!code) notFound();

  const [{ data: redemptions }, { data: sends }] = await Promise.all([
    admin
      .from("promo_redemptions")
      .select("id, customer_id, booking_id, discount_pence, status, created_at")
      .eq("code_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("promo_code_sends")
      .select("id, customer_id, channel, sent_at, error")
      .eq("code_id", id)
      .order("sent_at", { ascending: false })
      .limit(100),
  ]);

  // Name the customers on both lists in one round trip.
  const customerIds = [
    ...new Set([...(redemptions ?? []).map((r) => r.customer_id), ...(sends ?? []).map((s) => s.customer_id)]),
  ];
  const nameById = new Map<string, string>();
  if (customerIds.length) {
    const { data: profiles } = await admin.from("profiles").select("id, full_name").in("id", customerIds);
    for (const p of profiles ?? []) nameById.set(p.id, p.full_name ?? "Customer");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/admin/discounts"
          className="inline-flex items-center gap-1 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          <Icon icon={ChevronLeft} size={14} />
          Back to discounts
        </Link>
      </div>
      <header>
        <Overline>Commercial · Discounts</Overline>
        <h1 className="mt-1 font-mono text-3xl font-bold tracking-tight text-text-primary">{code.code}</h1>
        <p className="mt-1.5 text-sm text-text-muted">
          {promoOfferLabel(code)}
          {code.description ? ` · ${code.description}` : ""}
        </p>
      </header>

      <SendPanel codeId={code.id} code={code.code} offer={promoOfferLabel(code)} isActive={code.is_active} />

      <DiscountForm mode="edit" code={code as PromoCodeRow} />

      <Card className="space-y-3 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">Redemptions</h2>
        {(redemptions ?? []).length === 0 ? (
          <p className="text-sm text-text-muted">Nobody has used this code yet.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {(redemptions ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="text-text-primary">{nameById.get(r.customer_id) ?? "Customer"}</span>
                  <span className="text-text-muted">
                    {" · "}
                    {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {" · "}
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-text-primary">
                  −{formatPrice(r.discount_pence)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">Sent to</h2>
        {(sends ?? []).length === 0 ? (
          <p className="text-sm text-text-muted">Not sent to anyone yet.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {(sends ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="text-text-primary">{nameById.get(s.customer_id) ?? "Customer"}</span>
                  <span className="text-text-muted">
                    {" · "}
                    {s.channel === "sms" ? "Text" : "Email"}
                    {" · "}
                    {new Date(s.sent_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </span>
                {s.error && <span className="shrink-0 text-xs font-semibold text-red-600">Failed</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
