import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { StepHeader } from "@/components/customer/step-header";
import { Button } from "@/components/ui/button";
import { loadCustomQuote } from "@/lib/custom-quotes/server";
import { customQuoteRefusal, ownsCustomQuote } from "@/lib/custom-quotes/model";
import { formatPrice } from "@/lib/utils";
import { describeQuoteVehicle } from "@/lib/custom-quotes/href";
import { DeclineQuoteButton } from "./_components/decline-quote-button";

// A custom quote, as the customer opens it from their email (Task 75). Anyone
// with the link can read it (it shows a first name, the car and the price,
// nothing else); booking or declining it needs the account it was sent to.
// "Book a time" goes straight into the funnel's time step with ?quote=, which
// sends a signed-out customer to sign in (or create an account) first.

export const metadata: Metadata = { title: "Your quote · Book My Tech", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CustomQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await loadCustomQuote(createAdminClient(), id);
  if (!row) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const owner = user ? ownsCustomQuote(row, { userId: user.id, email: user.email ?? null }) : false;
  const vehicle = describeQuoteVehicle(row.vehicle_reg, row.vehicle_make, row.vehicle_model);
  const firstName = row.customer_name.trim().split(/\s+/)[0];
  const bookHref = `/book/time?quote=${row.id}`;
  const signupHref = `/signup?name=${encodeURIComponent(row.customer_name)}&email=${encodeURIComponent(row.customer_email)}&next=${encodeURIComponent(bookHref)}`;
  const refusal = customQuoteRefusal(row);

  return (
    <div className="flex flex-col gap-6">
      <StepHeader
        title={row.status === "requested" ? "We're pricing your job" : `Your quote, ${firstName}`}
        subtitle={vehicle}
      />

      {row.status === "requested" ? (
        <div className="rounded-[20px] border border-border bg-white p-5 shadow-card sm:p-6">
          <p className="text-[15px] text-text-secondary">
            We&apos;ve got your request and we&apos;ll email your quote as soon as it&apos;s ready, usually within one
            working day.
          </p>
          {row.request_text && (
            <p className="mt-3 rounded-xl bg-surface px-3.5 py-3 text-sm text-text-primary">
              &ldquo;{row.request_text}&rdquo;
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-brand-gradient p-6 text-white shadow-hero">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-200">Price for this job</p>
          <p className="mt-1 text-5xl font-extrabold tracking-tight">
            {row.total_pence != null ? formatPrice(row.total_pence) : "Not priced"}
          </p>
          <p className="mt-2 text-lg font-semibold text-blue-100">{row.title}</p>
          {row.details && (
            <p className="mt-3 whitespace-pre-line rounded-xl bg-white/10 px-3 py-2.5 text-sm text-blue-50">
              {row.details}
            </p>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-sm text-blue-100">
            <Check size={14} strokeWidth={3} className="text-blue-200" />
            Parts and labour included
          </p>
        </div>
      )}

      {row.status === "sent" && !refusal && (
        <div className="flex flex-col gap-3">
          {user && !owner ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
              This quote was sent to a different email address. Sign out and sign in with that one to book it.
            </p>
          ) : (
            <>
              <Link href={bookHref}>
                <Button variant="primary" size="lg" fullWidth iconRight={CalendarCheck}>
                  Book a time
                </Button>
              </Link>
              {!user && (
                <p className="text-center text-sm text-text-secondary">
                  You&apos;ll sign in first. New to Book My Tech?{" "}
                  <Link href={signupHref} className="font-semibold text-brand-blue hover:underline">
                    Create an account
                  </Link>
                </p>
              )}
            </>
          )}
          <p className="text-center text-[12px] text-text-muted">
            Nothing is charged now. When you book, the amount is pre-authorised on your card and only taken once the
            job is done.
          </p>
        </div>
      )}

      {row.status === "booked" && (
        <div className="rounded-[20px] border border-border bg-white p-5 text-[15px] text-text-secondary shadow-card">
          You&apos;ve booked this quote.{" "}
          {owner && row.booking_id && (
            <Link href={`/dashboard/bookings/${row.booking_id}`} className="font-semibold text-brand-blue hover:underline">
              View your booking
            </Link>
          )}
        </div>
      )}

      {(row.status === "declined" || row.status === "withdrawn") && (
        <div className="rounded-[20px] border border-border bg-white p-5 text-[15px] text-text-secondary shadow-card">
          {refusal}{" "}
          <Link href="/help" className="font-semibold text-brand-blue hover:underline">
            Contact us
          </Link>
        </div>
      )}

      {(row.status === "requested" || row.status === "sent") &&
        (owner ? (
          <DeclineQuoteButton quoteId={row.id} pricing={row.status === "requested"} />
        ) : (
          !user && (
            <p className="text-center text-[12px] text-text-muted">
              Don&apos;t want it? You can ignore this quote. Nothing is booked or charged unless you choose a time.
            </p>
          )
        ))}
    </div>
  );
}
