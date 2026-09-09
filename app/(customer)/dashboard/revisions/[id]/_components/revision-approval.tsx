"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HoldPayment, useResumeHold } from "@/components/customer/hold-payment";
import { formatPrice } from "@/lib/utils";
import { REVISION_STATUS_LABEL, isRevisionExpired } from "@/lib/revisions/status";
import { customerDirectionSentence, diffRevision, differenceLabel } from "@/lib/revisions/diff";
import type { RevisionView } from "@/lib/revisions/load";
import type { RevisionLine, RevisionPart } from "@/lib/revisions/snapshot";
import { approveRevision, confirmRevisionPayment, declineRevision } from "@/app/actions/customer-revisions";

// The customer reviews a revised job (Task 37): what they booked, what the
// mechanic found instead, and the new price — every line, before the buttons.
// A dearer job collects the card for the DIFFERENCE (the shared hold-payment
// flow); a cheaper or same-priced one applies on Approve.

interface RevisionApprovalProps {
  revision: RevisionView;
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

export function RevisionApproval({ revision, bookingRef, bookingStatus, mechanicName, customerName, customerEmail }: RevisionApprovalProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stage, setStage] = useState<Stage>({ phase: "review" });
  const diff = useMemo(() => diffRevision(revision.before, revision.after), [revision]);

  const open = revision.status === "sent" && !isRevisionExpired(revision);
  const dearer = revision.differencePence > 0;
  const confirm = (paymentIntentId: string) => confirmRevisionPayment(revision.id, paymentIntentId);

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
      const res = await declineRevision(revision.id);
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
      const res = await approveRevision(revision.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.outcome === "pay") {
        setStage({ phase: "pay", clientSecret: res.clientSecret, paymentIntentId: res.paymentIntentId, amountPence: res.amountPence });
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
      : revision.status === "sent" && isRevisionExpired(revision)
        ? "Expired"
        : REVISION_STATUS_LABEL[revision.status];

  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-blue">Revised job from {mechanicName}</p>
        <h1 className="mt-1 text-2xl font-bold text-text-primary">The repair you booked isn&apos;t what your car needs</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Job {bookingRef} · {statusLine}
        </p>
      </header>

      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <span className="font-semibold">What {mechanicName} found: </span>
        {revision.reason}
      </p>

      {/* What changes — every line, before the buttons. */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface-card">
        <Section title="No longer needed" tone="muted" lines={diff.lines.removed} parts={diff.parts.removed} strike />
        <Section title="Instead" tone="added" lines={diff.lines.added} parts={diff.parts.added} />
        <Section title="Still on the job" tone="plain" lines={diff.lines.kept} parts={diff.parts.kept} />
        {revision.after.oil && (
          <p className="px-4 py-2 text-xs text-text-muted">
            Includes engine oil · {revision.after.oil.litres} L × {formatPrice(revision.after.oil.pencePerLitre)}
          </p>
        )}
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border bg-surface px-4 py-3">
          <div className="text-sm text-text-secondary">
            Was <span className="font-semibold text-text-primary">{formatPrice(revision.before.totalPence)}</span>
            <span className="mx-2 text-text-muted">·</span>
            <span className={dearer ? "font-semibold text-amber-800" : "font-semibold text-success"}>{differenceLabel(revision.differencePence)}</span>
          </div>
          <div className="text-right">
            <span className="block text-xs font-semibold uppercase tracking-wide text-text-muted">New total</span>
            <span className="text-2xl font-extrabold tracking-tight text-text-primary">{formatPrice(revision.after.totalPence)}</span>
          </div>
        </div>
      </div>

      {diff.durationChange !== 0 && (
        <p className="text-xs text-text-muted">
          The visit is now about {revision.after.serviceDurationHours} h (was {revision.before.serviceDurationHours} h).
        </p>
      )}

      {revision.note && (
        <p className="rounded-xl bg-surface px-4 py-3 text-sm text-text-secondary">
          <span className="font-semibold text-text-primary">Note from your mechanic: </span>
          {revision.note}
        </p>
      )}

      {stage.phase === "done" ? (
        <p className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium ${stage.outcome === "approved" ? "bg-green-50 text-success" : "bg-surface text-text-secondary"}`}>
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          {stage.outcome === "approved"
            ? dearer
              ? `Approved. ${formatPrice(revision.differencePence)} is authorised on your card and the new total of ${formatPrice(revision.after.totalPence)} is charged when the job is complete. Your mechanic has been told to go ahead.`
              : `Approved. Only the new total of ${formatPrice(revision.after.totalPence)} is charged when the job is complete; the rest of your pre-authorisation is released. Your mechanic has been told to go ahead.`
            : "Declined. Your mechanic won't carry out the revised work — they'll be in touch about how to end the visit."}
        </p>
      ) : !open ? (
        <p className="rounded-xl bg-surface px-4 py-3 text-sm text-text-secondary">
          {revision.status === "approved"
            ? "You've approved this revised job."
            : revision.status === "sent"
              ? "This revised job has expired — ask your mechanic to send it again if you'd still like the work done."
              : `This revised job is ${REVISION_STATUS_LABEL[revision.status].toLowerCase()}.`}
        </p>
      ) : stage.phase === "pay" ? (
        <HoldPayment
          clientSecret={stage.clientSecret}
          paymentIntentId={stage.paymentIntentId}
          amountPence={stage.amountPence}
          customerName={customerName}
          customerEmail={customerEmail}
          returnUrl={`${window.location.origin}/dashboard/revisions/${revision.id}`}
          holdNote={`${formatPrice(stage.amountPence)} — the difference — is held now. Your original pre-authorisation still covers the rest, and the new total is charged when the job is complete.`}
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
            {customerDirectionSentence(revision.differencePence)} The work only goes ahead once you&apos;ve approved.
            {bookingStatus !== "in_progress" && " This job is no longer in progress."}
          </p>
          <Button size="lg" fullWidth iconLeft={Check} disabled={pending} onClick={approve}>
            {dearer ? `Approve and authorise ${formatPrice(revision.differencePence)}` : "Approve the revised job"}
          </Button>
          <Button size="lg" fullWidth variant="secondary" iconLeft={X} disabled={pending} onClick={decline}>
            Decline
          </Button>
          <p className="text-xs text-text-muted">
            If you decline, your mechanic may charge the on-site diagnostic or cancellation fee for the visit — see our cancellation policy. You&apos;re never charged for the revised work itself unless you approve it.
          </p>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  tone,
  lines,
  parts,
  strike = false,
}: {
  title: string;
  tone: "muted" | "added" | "plain";
  lines: RevisionLine[];
  parts: RevisionPart[];
  strike?: boolean;
}) {
  if (lines.length === 0 && parts.length === 0) return null;
  const text = strike ? "text-text-muted line-through" : tone === "added" ? "text-text-primary" : "text-text-primary";
  const bg = tone === "added" ? "bg-green-50/60" : "";
  return (
    <div className={`border-b border-border-subtle px-4 py-3 last:border-b-0 ${bg}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
      <ul className="mt-1.5 space-y-1 text-sm">
        {lines.map((l) => (
          <li key={l.nodeId} className="flex items-start justify-between gap-3">
            <span className={text}>
              {l.description}
              {l.itemLabel && <span className="text-text-muted"> · {l.itemLabel}</span>}
              <span className="text-xs text-text-muted"> · {l.kind === "product" ? "fixed price" : `${l.chargedHours} h`}</span>
            </span>
            <span className={`shrink-0 tabular-nums ${strike ? "text-text-muted line-through" : "font-semibold text-text-primary"}`}>{formatPrice(l.linePence)}</span>
          </li>
        ))}
        {parts.map((p, i) => (
          <li key={p.id ?? `${p.name}-${i}`} className="flex items-start justify-between gap-3">
            <span className={text}>
              {p.name}
              {p.quantity > 1 && <span className="text-xs text-text-muted"> × {p.quantity}</span>}
              <span className="text-xs text-text-muted"> · part</span>
            </span>
            <span className={`shrink-0 tabular-nums ${strike ? "text-text-muted line-through" : "font-semibold text-text-primary"}`}>{formatPrice(p.linePence)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
