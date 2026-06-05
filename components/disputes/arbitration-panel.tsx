"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { formatPrice, parsePrice } from "@/lib/utils";
import { resolveDispute } from "@/app/actions/disputes";
import { RESOLUTION_LABELS, type ResolutionKind } from "@/lib/disputes/constants";

const OPTIONS: { value: ResolutionKind; label: string }[] = [
  { value: "full_refund", label: RESOLUTION_LABELS.full_refund },
  { value: "partial_refund", label: RESOLUTION_LABELS.partial_refund },
  { value: "no_refund", label: RESOLUTION_LABELS.no_refund },
  { value: "in_mechanic_favour", label: RESOLUTION_LABELS.in_mechanic_favour },
];

// Admin's binding decision on an escalated (or still-open) dispute. Refunds the
// card, issues compensation credit, adjusts the mechanic payout and optionally
// flags the mechanic — all server-side in resolveDispute.
export function ArbitrationPanel({
  disputeId,
  chargedPence,
  suggestion,
}: {
  disputeId: string;
  chargedPence: number;
  suggestion: string | null;
}) {
  const router = useRouter();
  const [resolution, setResolution] = useState<ResolutionKind>("partial_refund");
  const [refundAmount, setRefundAmount] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [note, setNote] = useState("");
  const [flagMechanic, setFlagMechanic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (!note.trim()) {
      setError("Add a customer-facing explanation.");
      return;
    }
    let refundPence: number | undefined;
    if (resolution === "partial_refund") {
      const p = parsePrice(refundAmount);
      if (p == null || p <= 0) {
        setError("Enter the partial refund amount.");
        return;
      }
      refundPence = p;
    }
    const creditPence = creditAmount ? (parsePrice(creditAmount) ?? 0) : 0;

    startTransition(async () => {
      const res = await resolveDispute(disputeId, {
        resolution,
        refundPence,
        creditPence,
        note: note.trim(),
        flagMechanic,
      });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-surface-card p-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">Make a decision</h2>
      {suggestion && (
        <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-brand-blue">
          Suggested: {suggestion}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-text-primary">Outcome</label>
          <Select<ResolutionKind> value={resolution} onChange={setResolution} options={OPTIONS} aria-label="Resolution" />
          <span className="text-xs text-text-muted">Customer paid {formatPrice(chargedPence)} for this job.</span>
        </div>

        {resolution === "partial_refund" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-text-primary">Refund amount</label>
            <input
              type="text"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              placeholder="£ amount"
              inputMode="decimal"
              className="h-11 w-40 rounded-lg border border-border bg-surface-card px-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25"
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-text-primary">
            Compensation credit <span className="font-normal text-text-muted">(optional)</span>
          </label>
          <input
            type="text"
            value={creditAmount}
            onChange={(e) => setCreditAmount(e.target.value)}
            placeholder="£ amount"
            inputMode="decimal"
            className="h-11 w-40 rounded-lg border border-border bg-surface-card px-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-text-primary">Explanation (sent to both parties)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="Explain the decision clearly and fairly…"
            className="rounded-lg border border-border bg-surface-card px-3 py-2.5 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25 resize-none"
          />
        </div>

        <label className="flex items-center gap-2.5 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={flagMechanic}
            onChange={(e) => setFlagMechanic(e.target.checked)}
            className="size-4 rounded border-border text-brand-blue focus:ring-brand-blue/30"
          />
          Flag the mechanic&apos;s account (performance review)
        </label>

        {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">{error}</p>}

        <Button variant="primary" onClick={submit} disabled={pending} iconLeft={pending ? Loader2 : undefined} className="self-start">
          {pending ? "Resolving…" : "Resolve dispute"}
        </Button>
      </div>
    </div>
  );
}
