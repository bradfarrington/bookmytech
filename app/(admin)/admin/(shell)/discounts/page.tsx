import Link from "next/link";
import { Plus } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Overline } from "@/components/ui/overline";
import type { PromoCodeRow } from "@/lib/promos/validate";
import { DiscountsTable, type DiscountRow } from "./_components/discounts-table";

export const dynamic = "force-dynamic";

// Discount codes the admin sends out (Task 35). A code is BMT-funded: the
// customer pays less, the mechanic's payout is untouched.
//
// Service-role read: `promo_codes` is admin-only under RLS and this page is
// behind the proxy admin gate.

export default async function AdminDiscountsPage() {
  const admin = createAdminClient();
  const [{ data: codes, error }, { data: redemptions }, { data: sends }] = await Promise.all([
    admin
      .from("promo_codes")
      .select(
        "id, code, kind, value, description, starts_at, expires_at, max_redemptions, per_customer_limit, min_total_pence, is_active",
      )
      .order("created_at", { ascending: false }),
    admin.from("promo_redemptions").select("code_id, status, expires_at"),
    admin.from("promo_code_sends").select("code_id"),
  ]);

  const nowIso = new Date().toISOString();
  const usedByCode = new Map<string, number>();
  for (const r of redemptions ?? []) {
    const live = r.status === "redeemed" || (r.status === "reserved" && (r.expires_at ?? "") > nowIso);
    if (live) usedByCode.set(r.code_id, (usedByCode.get(r.code_id) ?? 0) + 1);
  }
  const sentByCode = new Map<string, number>();
  for (const s of sends ?? []) sentByCode.set(s.code_id, (sentByCode.get(s.code_id) ?? 0) + 1);

  const rows: DiscountRow[] = ((codes ?? []) as PromoCodeRow[]).map((c) => ({
    ...c,
    used: usedByCode.get(c.id) ?? 0,
    sent: sentByCode.get(c.id) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Overline>Commercial</Overline>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">Discounts</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
            Codes you can send to customers — &ldquo;10% off your next booking&rdquo; and the like. A code
            comes off the booking total before any account credit. <strong>Book My Tech funds it</strong>:
            the customer pays less and the mechanic is still paid in full, so it comes out of our
            commission.
          </p>
        </div>
        <Link href="/admin/discounts/new">
          <Button variant="primary" iconLeft={Plus}>
            New code
          </Button>
        </Link>
      </header>

      {error && (
        <div className="rounded-button border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load discount codes: {error.message}
        </div>
      )}

      <DiscountsTable codes={rows} />
    </div>
  );
}
