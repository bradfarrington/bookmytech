"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HoldPayment, useResumeHold } from "@/components/customer/hold-payment";
import { formatPrice } from "@/lib/utils";
import { QUOTE_KIND_LABEL, QUOTE_STATUS_LABEL, isQuoteExpired } from "@/lib/quotes/status";
import type { QuoteView } from "@/lib/quotes/load";
import { approveQuote, confirmQuotePayment, declineQuote } from "@/app/actions/customer-quotes";

// Approve / decline a quote (Task 33). Approving extra work on this visit
// authorises a SECOND hold on the card — the booking's own hold can't be
// increased — so the card is collected again here (components/customer/
// hold-payment.tsx, shared with revised jobs since Task 37), and the quote is
// only approved once `confirmQuotePayment` has proved the hold against Stripe.

interface QuoteApprovalProps {
  quote: QuoteView;
  bookingRef: string;
  bookingStatus: string;
  mechanicName: string;
  customerName: string;
  customerEmail: string;
}

type Stage =
  | { phase: "review" }
  | { phase: "pay"; clientSecret: string; paymentIntentId: string; amountPence: number }
  | { phase: "confirming" }
  | { phase: "done"; outcome: "approved" | "declined" };

export function QuoteApproval({ quote, bookingRef, bookingStatus, mechanicName, customerName, customerEmail }: QuoteApprovalProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stage, setStage] = useState<Stage>({ phase: "review" });

  const open = quote.status === "sent" && !isQuoteExpired(quote);
  const confirm = (paymentIntentId: string) => confirmQuotePayment(quote.id, paymentIntentId);

  useResumeHold({
    confirm,
    onConfirming: () => setStage({ phase: "confirming" }),
    onDone: () => {
      setStage({ phase: "done", outcome: "approved" });
      router.refresh();
    },
    onFail: (message) => {
      toast.error(message);
      setStage({ phase: "review" });
    },
  });

  function decline() {
    startTransition(async () => {
      const res = await declineQuote(quote.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Declined — your mechanic has been told.");
      setStage({ phase: "done", outcome: "declined" });
      router.refresh();
    });
  }

  function approve() {
    startTransition(async () => {
      const res = await approveQuote(quote.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.outcome === "pay") {
        setStage({ phase: "pay", clientSecret: res.clientSecret, paymentIntentId: res.paymentIntentId, amountPence: res.amountPence });
        return;
      }
      if (res.outcome === "book") {
        // A return visit: nothing to pay now — pick a time (Task 34).
        window.location.href = `/book/slot?quote=${encodeURIComponent(res.quoteId)}`;
        return;
      }
      setStage({ phase: "done", outcome: "approved" });
      router.refresh();
    });
  }

  const statusLine =
    stage.phase === "done"
      ? stage.outcome === "approved"
        ? "Approved"
        : "Declined"
      : quote.status === "sent" && isQuoteExpired(quote)
        ? "Expired"
        : QUOTE_STATUS_LABEL[quote.status];

  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-blue">Quote from {mechanicName}</p>
        <h1 className="mt-1 text-2xl font-bold text-text-primary">{quote.title ?? QUOTE_KIND_LABEL[quote.kind]}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Job {bookingRef} · {quote.kind === "follow_on" ? "a return visit" : "extra work on your current job"} · {statusLine}
        </p>
      </header>

      {/* The lines and the total — always shown before the buttons. */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface-card">
        <ul className="divide-y divide-border-subtle">
          {quote.lines.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="text-text-primary">{l.description}</p>
                <p className="text-xs text-text-muted">
                  {l.kind === "labour"
                    ? `Labour · ${l.hours} h × ${formatPrice(l.unitPence)}`
                    : l.kind === "part"
                      ? `Part${l.quantity > 1 ? ` × ${l.quantity}` : ""}${l.quantity > 1 ? ` · ${formatPrice(l.unitPence)} each` : ""}`
                      : l.quantity > 1
                        ? `× ${l.quantity} · ${formatPrice(l.unitPence)} each`
                        : ""}
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums text-text-primary">{formatPrice(l.linePence)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between border-t border-border bg-surface px-4 py-3">
          <span className="text-sm font-bold text-text-primary">Total</span>
          <span className="text-2xl font-extrabold tracking-tight text-text-primary">{formatPrice(quote.totalPence)}</span>
        </div>
      </div>

      {quote.note && (
        <p className="rounded-xl bg-surface px-4 py-3 text-sm text-text-secondary">
          <span className="font-semibold text-text-primary">Note from your mechanic: </span>
          {quote.note}
        </p>
      )}

      {stage.phase === "done" ? (
        <p className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium ${stage.outcome === "approved" ? "bg-green-50 text-success" : "bg-surface text-text-secondary"}`}>
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          {stage.outcome === "approved"
            ? quote.kind === "now"
              ? `Approved. ${formatPrice(quote.totalPence)} is authorised on your card and will be charged with the job when it's complete. Your mechanic has been told to go ahead.`
              : "Approved."
            : "Declined. Your mechanic won't carry out this work."}
        </p>
      ) : !open ? (
        <p className="rounded-xl bg-surface px-4 py-3 text-sm text-text-secondary">
          {quote.status === "approved"
            ? "You've approved this quote."
            : quote.status === "sent"
              ? "This quote has expired — ask your mechanic to send it again if you'd still like the work done."
              : `This quote is ${QUOTE_STATUS_LABEL[quote.status].toLowerCase()}.`}
        </p>
      ) : stage.phase === "pay" ? (
        <HoldPayment
          clientSecret={stage.clientSecret}
          paymentIntentId={stage.paymentIntentId}
          amountPence={stage.amountPence}
          customerName={customerName}
          customerEmail={customerEmail}
          returnUrl={`${window.location.origin}/dashboard/quotes/${quote.id}`}
          holdNote={`${formatPrice(stage.amountPence)} is held now and charged when the job is complete, like your original booking.`}
          confirm={confirm}
          onDone={() => {
            setStage({ phase: "done", outcome: "approved" });
            router.refresh();
          }}
          onBack={() => setStage({ phase: "review" })}
        />
      ) : stage.phase === "confirming" ? (
        <p className="rounded-xl bg-surface px-4 py-3 text-sm text-text-secondary">Confirming your payment…</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="rounded-xl bg-blue-50 px-4 py-3 text-[13px] leading-relaxed text-text-secondary">
            {quote.kind === "now"
              ? `Approving authorises ${formatPrice(quote.totalPence)} on your card now — nothing is charged until the job is complete, and the work only goes ahead once you've approved.`
              : "Approving doesn't take any payment — you'll pick a date for the return visit next, and your mechanic is offered the job first."}
            {bookingStatus !== "in_progress" && quote.kind === "now" && " This job is no longer in progress."}
          </p>
          <Button size="lg" fullWidth iconLeft={Check} disabled={pending} onClick={approve}>
            {quote.kind === "now" ? `Approve and authorise ${formatPrice(quote.totalPence)}` : "Approve and pick a date"}
          </Button>
          <Button size="lg" fullWidth variant="secondary" iconLeft={X} disabled={pending} onClick={decline}>
            Decline
          </Button>
        </div>
      )}
    </div>
  );
}
