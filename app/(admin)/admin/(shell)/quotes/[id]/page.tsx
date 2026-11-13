import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { Overline } from "@/components/ui/overline";
import { Pill } from "@/components/ui/pill";
import { loadCustomQuote } from "@/lib/custom-quotes/server";
import { CUSTOM_QUOTE_ADMIN_LABEL, isOpenForAdmin } from "@/lib/custom-quotes/model";
import { formatPrice } from "@/lib/utils";
import { describeQuoteVehicle } from "@/lib/custom-quotes/href";
import { QuoteForm } from "../_components/quote-form";

export const dynamic = "force-dynamic";

// One custom quote (Task 75): the customer's request in their words, and the
// form to price and send it while it's open. Closed quotes are read-only.

function stamp(iso: string | null): string | null {
  return iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Europe/London",
      })
    : null;
}

export default async function CustomQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quote = await loadCustomQuote(createAdminClient(), id);
  if (!quote) notFound();
  const open = isOpenForAdmin(quote.status);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Overline>Quotes</Overline>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
            {quote.title ?? `Quote for ${quote.customer_name}`}
          </h1>
          <p className="mt-1.5 text-sm text-text-muted">
            {describeQuoteVehicle(quote.vehicle_reg, quote.vehicle_make, quote.vehicle_model)} ·{" "}
            {quote.source === "customer" ? "Asked for by the customer" : "Started in the dashboard"} ·{" "}
            created {stamp(quote.created_at)}
            {quote.sent_at && <> · sent {stamp(quote.sent_at)}</>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Pill tone={quote.status === "booked" ? "success" : quote.status === "sent" ? "active" : "neutral"}>
            {CUSTOM_QUOTE_ADMIN_LABEL[quote.status]}
          </Pill>
          {quote.status !== "requested" && (
            <Link
              href={`/book/quote/${quote.id}`}
              target="_blank"
              className="flex items-center gap-1 text-sm font-semibold text-brand-blue hover:underline"
            >
              Customer&apos;s view <ExternalLink size={13} />
            </Link>
          )}
        </div>
      </div>

      {quote.request_text && (
        <Card className="space-y-2 p-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">What the customer asked for</h2>
          <p className="whitespace-pre-line text-sm text-text-primary">{quote.request_text}</p>
        </Card>
      )}

      {quote.status === "booked" && quote.booking_id && (
        <Card className="p-6 text-sm text-text-primary">
          Booked for {quote.total_pence != null ? formatPrice(quote.total_pence) : "the quoted price"}.{" "}
          <Link href={`/admin/jobs/${quote.booking_id}`} className="font-semibold text-brand-blue hover:underline">
            Open the job
          </Link>
        </Card>
      )}

      {open ? (
        <QuoteForm quote={quote} />
      ) : (
        <Card className="space-y-2 p-6 text-sm">
          <p className="font-semibold text-text-primary">
            {quote.title ?? "Not priced"} · {quote.total_pence != null ? formatPrice(quote.total_pence) : "no price"}
          </p>
          {quote.details && <p className="whitespace-pre-line text-text-secondary">{quote.details}</p>}
          <p className="text-text-muted">
            {quote.customer_name} · {quote.customer_email}
            {quote.customer_phone ? ` · ${quote.customer_phone}` : ""}
          </p>
          {quote.status !== "booked" && (
            <p className="text-text-muted">
              This quote is closed. To quote again, start a{" "}
              <Link href="/admin/quotes/new" className="font-semibold text-brand-blue hover:underline">
                new quote
              </Link>
              .
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
