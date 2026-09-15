"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, MessageSquareQuote, Package, TriangleAlert, Wrench, X } from "lucide-react";
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
import { cn, formatPrice } from "@/lib/utils";
import { REVISION_STATUS_LABEL, isRevisionExpired } from "@/lib/revisions/status";
import { customerDirectionSentence, diffRevision, differenceLabel } from "@/lib/revisions/diff";
import type { RevisionView } from "@/lib/revisions/load";
import type { RevisionLine, RevisionPart } from "@/lib/revisions/snapshot";
import { approveRevision, confirmRevisionPayment, declineRevision } from "@/app/actions/customer-revisions";

// The customer reviews a revised job (Task 37): what they booked, what the
// mechanic found instead, and the new price — every line, before the buttons.
// A dearer job collects the card for the DIFFERENCE (the shared hold-payment
// flow); a cheaper or same-priced one applies on Approve.
//
// Task 48: styled to mockup 04 "Revised job" (amber) with the dashboard
// building blocks. The stages, calls and redirects are unchanged.

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
      toast.success("Declined. Your mechanic has been told.");
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

  const status: { tone: PillTone; label: string } =
    stage.phase === "done"
      ? stage.outcome === "approved"
        ? { tone: "success", label: "Approved" }
        : { tone: "neutral", label: "Declined" }
      : revision.status === "sent" && isRevisionExpired(revision)
        ? { tone: "neutral", label: "Expired" }
        : open
          ? { tone: "pending", label: "Waiting on you" }
          : { tone: revision.status === "approved" ? "success" : "neutral", label: REVISION_STATUS_LABEL[revision.status] };

  const d = revision.differencePence;
  const cheaper = d < 0;
  const priceSummary =
    d > 0 ? `${formatPrice(d)} more than booked` : d < 0 ? `${formatPrice(-d)} less than booked` : "Same price as booked";

  return (
    <Stack>
      <div>
        <h2 className="font-display text-2xl font-extrabold leading-[30px] tracking-[-0.6px] text-text-primary">
          {mechanicName} has revised the job
        </h2>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
          <Caption>{priceSummary}</Caption>
        </div>
        <Caption className="mt-1.5">Job {bookingRef}</Caption>
      </div>

      <Panel tone="warn">
        <div className="flex items-start gap-2.5">
          <Tile icon={TriangleAlert} tone="warn" size="sm" />
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-bold leading-5 text-amber-900">Why the booked repair isn&apos;t right</div>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-[18px] text-amber-900">&ldquo;{revision.reason}&rdquo;</p>
          </div>
        </div>
      </Panel>

      {/* What changes — every line, before the buttons. */}
      <DiffSection title="No longer needed" lines={diff.lines.removed} parts={diff.parts.removed} strike />
      <DiffSection title="Instead" lines={diff.lines.added} parts={diff.parts.added} />
      <DiffSection title="Still on the job" lines={diff.lines.kept} parts={diff.parts.kept} />
      {revision.after.oil && (
        <Caption>
          Includes engine oil · {revision.after.oil.litres} L × {formatPrice(revision.after.oil.pencePerLitre)}
        </Caption>
      )}

      <Section title="Price">
        <ListCard>
          <div className="flex items-center justify-between gap-4 px-3.5 py-3">
            <span className="text-xs leading-4 text-text-muted">Was</span>
            <span className="text-[13px] tabular-nums text-text-muted line-through">{formatPrice(revision.before.totalPence)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 px-3.5 py-3">
            <span className="text-xs leading-4 text-text-muted">Now</span>
            <span className="font-display text-[17px] font-bold leading-[22px] tabular-nums text-text-primary">
              {formatPrice(revision.after.totalPence)}
            </span>
          </div>
          <div
            className={cn(
              "flex items-center justify-between gap-4 px-3.5 py-3",
              dearer ? "bg-amber-50" : cheaper ? "bg-green-50" : undefined,
            )}
          >
            <span className={cn("text-xs leading-4", dearer ? "text-amber-900" : cheaper ? "text-green-900" : "text-text-muted")}>
              Difference
            </span>
            <span
              className={cn(
                "text-[13.5px] font-bold tabular-nums",
                dearer ? "text-amber-700" : cheaper ? "text-green-700" : "text-text-primary",
              )}
            >
              {d === 0 ? "No change" : differenceLabel(d)}
            </span>
          </div>
        </ListCard>
      </Section>

      {diff.durationChange !== 0 && (
        <Caption>
          The visit is now about {revision.after.serviceDurationHours} h (was {revision.before.serviceDurationHours} h).
        </Caption>
      )}

      {revision.note && (
        <Panel tone="tint">
          <div className="flex items-start gap-2.5">
            <Tile icon={MessageSquareQuote} size="sm" className="bg-white" />
            <div className="min-w-0 flex-1">
              <Caption className="text-text-secondary">Note from {mechanicName}</Caption>
              <p className="mt-1 whitespace-pre-wrap text-[13.5px] italic leading-5 text-text-secondary">
                &ldquo;{revision.note}&rdquo;
              </p>
            </div>
          </div>
        </Panel>
      )}

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
                ? dearer
                  ? `Approved. ${formatPrice(revision.differencePence)} is authorised on your card and the new total of ${formatPrice(revision.after.totalPence)} is charged when the job is complete. Your mechanic has been told to go ahead.`
                  : `Approved. Only the new total of ${formatPrice(revision.after.totalPence)} is charged when the job is complete; the rest of your pre-authorisation is released. Your mechanic has been told to go ahead.`
                : "Declined. Your mechanic won't carry out the revised work. They'll be in touch about how to end the visit."}
            </p>
          </div>
        </Panel>
      ) : !open ? (
        <Panel>
          <p className="text-[13px] leading-[19px] text-text-secondary">
            {revision.status === "approved"
              ? "You've approved this revised job."
              : revision.status === "sent"
                ? "This revised job has expired. Ask your mechanic to send it again if you'd still like the work done."
                : `This revised job is ${REVISION_STATUS_LABEL[revision.status].toLowerCase()}.`}
          </p>
        </Panel>
      ) : stage.phase === "pay" ? (
        <HoldPayment
          clientSecret={stage.clientSecret}
          paymentIntentId={stage.paymentIntentId}
          amountPence={stage.amountPence}
          customerName={customerName}
          customerEmail={customerEmail}
          returnUrl={`${window.location.origin}/dashboard/revisions/${revision.id}`}
          holdNote={`${formatPrice(stage.amountPence)} (the difference) is held now. Your original pre-authorisation still covers the rest, and the new total is charged when the job is complete.`}
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
        <>
          <Caption>
            If you decline, your mechanic may charge the on-site diagnostic or cancellation fee for the visit. See our{" "}
            <Link href="/cancellation-policy" className="font-semibold text-brand-blue hover:text-brand-blue-dark">
              cancellation policy
            </Link>
            . You&apos;re never charged for the revised work itself unless you approve it.
          </Caption>
          <div className="sticky bottom-0 z-10 -mx-4 mt-1 flex flex-col gap-2 border-t border-border-subtle bg-surface px-4 pb-5 pt-3 sm:-mx-6 sm:px-6">
            <Button size="lg" full disabled={pending} onClick={approve}>
              Approve · {formatPrice(revision.after.totalPence)}
            </Button>
            <Button variant="ghost" full disabled={pending} onClick={decline}>
              Decline
            </Button>
            <Caption className="text-center">
              {customerDirectionSentence(revision.differencePence)} The work only goes ahead once you&apos;ve approved.
              {bookingStatus !== "in_progress" && " This job is no longer in progress."}
            </Caption>
          </div>
        </>
      )}
    </Stack>
  );
}

function DiffSection({
  title,
  lines,
  parts,
  strike = false,
}: {
  title: string;
  lines: RevisionLine[];
  parts: RevisionPart[];
  strike?: boolean;
}) {
  if (lines.length === 0 && parts.length === 0) return null;
  const titleClassName = strike ? "font-normal text-text-muted line-through" : undefined;
  const price = cn("shrink-0 tabular-nums", strike ? "text-[13px] text-text-muted line-through" : "text-sm font-bold text-text-primary");
  return (
    <Section title={title}>
      <ListCard>
        {lines.map((l) => (
          <ListRow
            key={l.nodeId}
            leading={strike ? undefined : <Tile icon={Wrench} size="sm" />}
            title={
              <>
                {l.description}
                {l.itemLabel && <span className="font-normal text-text-muted"> · {l.itemLabel}</span>}
              </>
            }
            titleClassName={titleClassName}
            caption={l.kind === "product" ? "Fixed price" : `${l.chargedHours} h labour`}
            trailing={<span className={price}>{formatPrice(l.linePence)}</span>}
          />
        ))}
        {parts.map((p, i) => (
          <ListRow
            key={p.id ?? `${p.name}-${i}`}
            leading={strike ? undefined : <Tile icon={Package} size="sm" />}
            title={p.name}
            titleClassName={titleClassName}
            caption={p.quantity > 1 ? `Part × ${p.quantity}` : "Part"}
            trailing={<span className={price}>{formatPrice(p.linePence)}</span>}
          />
        ))}
      </ListCard>
    </Section>
  );
}
