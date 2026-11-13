import Link from "next/link";
import { Plus } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Overline } from "@/components/ui/overline";
import { Pill } from "@/components/ui/pill";
import { cn, formatPrice } from "@/lib/utils";
import {
  CUSTOM_QUOTE_ADMIN_LABEL,
  CUSTOM_QUOTE_COLUMNS,
  type CustomQuoteRow,
  type CustomQuoteStatus,
} from "@/lib/custom-quotes/model";

export const dynamic = "force-dynamic";

// Custom quotes (Task 75): jobs the catalogue doesn't list, priced by hand.
// Requests from customers wait under "To price"; a sent quote is open until the
// customer books or declines it, or it's withdrawn here.
//
// Service-role read: custom_quotes is admin-only under RLS (bar a customer's
// own rows) and this page is behind the proxy admin gate.

const TONE: Record<CustomQuoteStatus, "pending" | "active" | "success" | "neutral" | "error"> = {
  requested: "pending",
  sent: "active",
  booked: "success",
  declined: "error",
  withdrawn: "neutral",
};

const SECTIONS: Array<{ title: string; statuses: CustomQuoteStatus[]; empty: string }> = [
  { title: "To price", statuses: ["requested"], empty: "No requests waiting. They appear here when a customer asks for a quote." },
  { title: "Sent, waiting for the customer", statuses: ["sent"], empty: "No quotes waiting for an answer." },
  { title: "Closed", statuses: ["booked", "declined", "withdrawn"], empty: "Nothing closed yet." },
];

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
}

export default async function AdminQuotesPage() {
  const { data, error } = await createAdminClient()
    .from("custom_quotes")
    .select(CUSTOM_QUOTE_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = (data ?? []) as CustomQuoteRow[];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Overline>Operations</Overline>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">Quotes</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
            Jobs we don&apos;t list, priced by hand. Price a customer&apos;s request (or start one yourself) as one
            total and send it: the customer gets an email with a link, and booking it goes through the normal
            checkout and is offered to every mechanic. A quote stays open until the customer declines it or you
            withdraw it.
          </p>
        </div>
        <Link href="/admin/quotes/new">
          <Button variant="primary" iconLeft={Plus}>
            New quote
          </Button>
        </Link>
      </header>

      {error && (
        <div className="rounded-button border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load quotes: {error.message}. Has migration 0089 been applied?
        </div>
      )}

      {SECTIONS.map((section) => {
        const list = rows.filter((r) => section.statuses.includes(r.status));
        return (
          <section key={section.title} className="space-y-2">
            <h2 className="text-sm font-bold text-text-primary">
              {section.title} <span className="font-normal text-text-muted">({list.length})</span>
            </h2>
            {list.length === 0 ? (
              <Card className="px-4 py-6 text-center text-sm text-text-muted">{section.empty}</Card>
            ) : (
              <Card className="overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                        <th className="px-4 py-2.5">Customer</th>
                        <th className="px-4 py-2.5">Vehicle</th>
                        <th className="px-4 py-2.5">Job</th>
                        <th className="px-4 py-2.5 text-right">Price</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5 text-right">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r) => (
                        <tr
                          key={r.id}
                          className={cn("border-b border-border/60 last:border-0 hover:bg-surface", r.status === "withdrawn" && "opacity-60")}
                        >
                          <td className="px-4 py-3">
                            <Link href={`/admin/quotes/${r.id}`} className="font-semibold text-text-primary hover:text-brand-blue">
                              {r.customer_name}
                            </Link>
                            <div className="text-xs text-text-muted">{r.customer_email}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-text-primary">{r.vehicle_reg}</div>
                            <div className="text-xs text-text-muted">
                              {[r.vehicle_make, r.vehicle_model].filter(Boolean).join(" ")}
                            </div>
                          </td>
                          <td className="max-w-[28rem] px-4 py-3">
                            <Link href={`/admin/quotes/${r.id}`} className="line-clamp-2 text-text-primary hover:text-brand-blue">
                              {r.title ?? r.request_text ?? "Untitled"}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-text-primary">
                            {r.total_pence != null ? formatPrice(r.total_pence) : "Not priced"}
                          </td>
                          <td className="px-4 py-3">
                            <Pill tone={TONE[r.status]}>{CUSTOM_QUOTE_ADMIN_LABEL[r.status]}</Pill>
                          </td>
                          <td className="px-4 py-3 text-right text-text-secondary">{when(r.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </section>
        );
      })}
    </div>
  );
}
