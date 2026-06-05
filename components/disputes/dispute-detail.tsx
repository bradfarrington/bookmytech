"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Scale, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { DisputeThread } from "./dispute-thread";
import { withdrawDispute, escalateDispute } from "@/app/actions/disputes";
import {
  REASON_LABELS,
  DISPUTE_STATUS_LABELS,
  DISPUTE_STATUS_TONES,
  RESOLUTION_LABELS,
  type DisputeStatus,
  type ResolutionKind,
} from "@/lib/disputes/constants";

export interface DisputeDetailData {
  disputeId: string;
  status: DisputeStatus;
  serviceName: string;
  ref: string;
  reasonCategory: string;
  description: string;
  photos: string[];
  refundRequestedPence: number | null;
  openedByRole: "customer" | "mechanic";
  createdAt: string;
  resolution: ResolutionKind | null;
  resolutionNote: string | null;
  resolutionRefundPence: number | null;
  resolutionCreditPence: number | null;
}

export function DisputeDetail({
  data,
  viewerRole,
  isOpener,
}: {
  data: DisputeDetailData;
  viewerRole: "customer" | "mechanic" | "admin";
  isOpener: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const closed = data.status === "resolved" || data.status === "withdrawn";
  const canWithdraw = isOpener && !closed;
  const canEscalate =
    viewerRole !== "admin" && (data.status === "opened" || data.status === "responded");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-text-muted">Booking {data.ref}</p>
          <h1 className="text-2xl font-bold text-text-primary">{data.serviceName}</h1>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${DISPUTE_STATUS_TONES[data.status]}`}>
          {DISPUTE_STATUS_LABELS[data.status]}
        </span>
      </div>

      {/* The opener's case */}
      <div className="rounded-2xl border border-border bg-surface-card p-5">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-text-muted">
          {REASON_LABELS[data.reasonCategory] ?? data.reasonCategory} · raised by the {data.openedByRole}
        </p>
        <p className="whitespace-pre-wrap text-sm text-text-primary">{data.description}</p>
        {data.refundRequestedPence != null && (
          <p className="mt-2 text-sm font-medium text-text-secondary">
            Refund sought: {formatPrice(data.refundRequestedPence)}
          </p>
        )}
        {data.photos.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {data.photos.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <a key={url} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt="" className="size-20 rounded-lg border border-border object-cover" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Resolution outcome */}
      {closed && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-green-900">
            <Scale size={16} />
            {data.resolution ? RESOLUTION_LABELS[data.resolution] : "Resolved"}
          </div>
          {data.resolutionNote && <p className="mt-1.5 text-sm text-green-900">{data.resolutionNote}</p>}
          {(data.resolutionRefundPence ?? 0) > 0 && (
            <p className="mt-1 text-sm text-green-900">Refund: {formatPrice(data.resolutionRefundPence ?? 0)}</p>
          )}
          {(data.resolutionCreditPence ?? 0) > 0 && (
            <p className="text-sm text-green-900">Account credit: {formatPrice(data.resolutionCreditPence ?? 0)}</p>
          )}
        </div>
      )}

      {/* Conversation */}
      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-text-muted">Conversation</h2>
        <DisputeThread disputeId={data.disputeId} viewerRole={viewerRole} closed={closed} />
        {viewerRole !== "admin" && data.status === "escalated" && (
          <p className="mt-2 text-xs text-text-muted">
            Book My Tech is reviewing this dispute and will make a decision shortly.
          </p>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">{error}</p>}

      {/* Party actions */}
      {(canWithdraw || canEscalate) && (
        <div className="flex flex-wrap gap-3">
          {canWithdraw && (
            <Button variant="secondary" onClick={() => run(() => withdrawDispute(data.disputeId))} disabled={pending} iconLeft={pending ? Loader2 : undefined}>
              {data.openedByRole === viewerRole ? "Withdraw — we've sorted it" : "Close dispute"}
            </Button>
          )}
          {canEscalate && (
            <Button variant="ghost" onClick={() => run(() => escalateDispute(data.disputeId))} disabled={pending}>
              Ask Book My Tech to step in
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
