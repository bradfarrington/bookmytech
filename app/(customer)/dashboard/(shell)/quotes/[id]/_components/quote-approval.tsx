"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Clock, MessageSquareQuote, Package, Wrench, X } from "lucide-react";
import {
  Button,
  Caption,
  ListCard,
  ListRow,
  Panel,
  Section,
  Stack,
  StatusPill,
  Tile,
  type PillTone,
} from "@/components/dashboard/ui";
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
//
// Task 48: styled to mockup 04 "Quote" with the dashboard building blocks. The
// stages, calls and redirects are unchanged.

interface QuoteApprovalProps {
  quote: QuoteView;
  bookingRef: string;
  bookingStatus: string;
  mechanicName: string;
  customerName: string;
  customerEmail: string;
  /** "Thu 18 Sep · 17:00", formatted on the server; null when the quote has no expiry. */
  expiresLabel: string | null;
}

type Stage =
  | { phase: "review" }
  | { phase: "pay"; clientSecret: string; paymentIntentId: string; amountPence: number }
  | { phase: "confirming" }
  | { phase: "done"; outcome: "approved" | "declined" };

export function QuoteApproval({
  quote,
  bookingRef,
  bookingStatus,
  mechanicName,
  customerName,
  customerEmail,
  expiresLabel,
}: QuoteApprovalProps) {
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
      toast.success("Declined. Your mechanic has been told.");
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

  const status: { tone: PillTone; label: string } =
    stage.phase === "done"
      ? stage.outcome === "approved"
        ? { tone: "success", label: "Approved" }
        : { tone: "neutral", label: "Declined" }
      : quote.status === "sent" && isQuoteExpired(quote)
        ? { tone: "neutral", label: "Expired" }
        : open
          ? { tone: "pending", label: "Waiting on you" }
          : { tone: quote.status === "approved" ? "success" : "neutral", label: QUOTE_STATUS_LABEL[quote.status] };

  const splitAddsUp = quote.labourPence > 0 && quote.partsPence > 0 && quote.labourPence + quote.partsPence === quote.totalPence;

  return (
    <Stack>
      <div>
        <h2 className="font-display text-2xl font-extrabold leading-[30px] tracking-[-0.6px] text-text-primary">
          {quote.title ?? QUOTE_KIND_LABEL[quote.kind]}
        </h2>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
          <Caption>{quote.kind === "follow_on" ? "A return visit" : "Extra work on your current job"}</Caption>
        </div>
        <Caption className="mt-1.5">
          From {mechanicName} · Job {bookingRef}
          {open && expiresLabel ? ` · Expires ${expiresLabel}` : ""}
        </Caption>
      </div>

      {quote.note && (
        <Panel tone="tint">
          <div className="flex items-start gap-2.5">
            <Tile icon={MessageSquareQuote} size="sm" className="bg-white" />
            <div className="min-w-0 flex-1">
              <Caption className="text-text-secondary">From {mechanicName}</Caption>
              <p className="mt-1 whitespace-pre-wrap text-[13.5px] italic leading-5 text-text-secondary">
                &ldquo;{quote.note}&rdquo;
              </p>
            </div>
          </div>
        </Panel>
      )}

      {/* The lines and the total — always shown before the buttons. */}
      <Section title="What's quoted">
        <ListCard>
          {quote.lines.map((l) => {
            const detail =
              l.kind === "labour"
                ? `Labour · ${l.hours} h × ${formatPrice(l.unitPence)}`
                : l.kind === "part"
                  ? `Part${l.quantity > 1 ? ` × ${l.quantity}` : ""}${l.quantity > 1 ? ` · ${formatPrice(l.unitPence)} each` : ""}`
                  : l.quantity > 1
                    ? `× ${l.quantity} · ${formatPrice(l.unitPence)} each`
                    : "";
            return (
              <ListRow
                key={l.id}
                leading={<Tile icon={l.kind === "labour" ? Clock : l.kind === "part" ? Package : Wrench} size="sm" />}
                title={l.description}
                caption={detail || undefined}
                trailing={
                  <span className="shrink-0 text-sm font-bold tabular-nums text-text-primary">{formatPrice(l.linePence)}</span>
                }
              />
            );
          })}
        </ListCard>
      </Section>

      <Panel tone="dark">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 text-xs leading-4 text-white/60">
            <div>Total</div>
            {splitAddsUp && (
              <div className="mt-0.5">
                Labour {formatPrice(quote.labourPence)} · Parts {formatPrice(quote.partsPence)}
              </div>
            )}
          </div>
          <div className="font-display text-[28px] font-extrabold leading-8 tracking-[-0.7px] text-white tabular-nums">
            {formatPrice(quote.totalPence)}
          </div>
        </div>
      </Panel>

      {stage.phase === "done" ? (
        <Panel>
          <div className="flex items-start gap-3">
            <Tile
              icon={stage.outcome === "approved" ? CheckCircle2 : X}
              tone={stage.outcome === "approved" ? "success" : "neutral"}
              size="sm"
            />
            <p className="min-w-0 flex-1 text-[13px] leading-[19px] text-text-secondary">
              {stage.outcome === "approved"
                ? quote.kind === "now"
                  ? `Approved. ${formatPrice(quote.totalPence)} is authorised on your card and will be charged with the job when it's complete. Your mechanic has been told to go ahead.`
                  : "Approved."
                : "Declined. Your mechanic won't carry out this work."}
            </p>
          </div>
        </Panel>
      ) : !open ? (
        <Panel>
          <p className="text-[13px] leading-[19px] text-text-secondary">
            {quote.status === "approved"
              ? "You've approved this quote."
              : quote.status === "sent"
                ? "This quote has expired. Ask your mechanic to send it again if you'd still like the work done."
                : `This quote is ${QUOTE_STATUS_LABEL[quote.status].toLowerCase()}.`}
          </p>
        </Panel>
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
        <Panel>
          <p className="text-[13px] leading-[19px] text-text-secondary">Confirming your payment…</p>
        </Panel>
      ) : (
        <div className="sticky bottom-0 z-10 -mx-4 mt-1 flex flex-col gap-2 border-t border-border-subtle bg-surface px-4 pb-5 pt-3 sm:-mx-6 sm:px-6">
          <Button size="lg" full disabled={pending} onClick={approve}>
            {quote.kind === "now" ? `Approve · ${formatPrice(quote.totalPence)}` : "Approve and pick a date"}
          </Button>
          <Button variant="ghost" full disabled={pending} onClick={decline}>
            Decline
          </Button>
          <Caption className="text-center">
            {quote.kind === "now"
              ? `Approving authorises ${formatPrice(quote.totalPence)} on your card now. Nothing is charged until the job is complete, and the work only goes ahead once you've approved.`
              : "Approving doesn't take any payment. You'll pick a date for the return visit next, and your mechanic is offered the job first."}
            {bookingStatus !== "in_progress" && quote.kind === "now" && " This job is no longer in progress."}
          </Caption>
        </div>
      )}
    </Stack>
  );
}
