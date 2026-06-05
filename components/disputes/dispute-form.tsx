"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { formatPrice, parsePrice } from "@/lib/utils";
import { openDispute, uploadDisputePhoto } from "@/app/actions/disputes";
import {
  reasonsFor,
  MIN_DESCRIPTION_CHARS,
  MAX_DISPUTE_PHOTOS,
  type RefundRequestKind,
} from "@/lib/disputes/constants";

// Shared "raise a dispute" form for both the customer and the mechanic. The
// refund request block only shows for customers (mechanics raise issues, not
// refund asks). On success it routes to the party's dispute detail page.
export function DisputeForm({
  bookingId,
  role,
  totalPence,
  serviceName,
  redirectBase,
}: {
  bookingId: string;
  role: "customer" | "mechanic";
  totalPence: number;
  serviceName: string;
  /** e.g. "/dashboard/disputes" or "/mechanic/disputes". */
  redirectBase: string;
}) {
  const router = useRouter();
  const reasons = reasonsFor(role);
  const [reason, setReason] = useState<string>(reasons[0].value);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [refundKind, setRefundKind] = useState<RefundRequestKind>("none");
  const [refundAmount, setRefundAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    const room = MAX_DISPUTE_PHOTOS - photos.length;
    for (const file of Array.from(files).slice(0, room)) {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadDisputePhoto(fd);
      if (res.ok) setPhotos((p) => [...p, res.url]);
      else setError(res.error);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function submit() {
    setError(null);
    if (description.trim().length < MIN_DESCRIPTION_CHARS) {
      setError(`Please add at least ${MIN_DESCRIPTION_CHARS} characters describing the issue.`);
      return;
    }
    let refundRequestedPence: number | null = null;
    if (role === "customer" && refundKind === "full") refundRequestedPence = totalPence;
    if (role === "customer" && refundKind === "partial") {
      const pence = parsePrice(refundAmount);
      if (pence == null || pence <= 0) {
        setError("Enter the partial refund amount you're seeking.");
        return;
      }
      refundRequestedPence = Math.min(pence, totalPence);
    }

    startTransition(async () => {
      const res = await openDispute(bookingId, {
        reasonCategory: reason,
        description: description.trim(),
        photos,
        refundRequestedPence,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`${redirectBase}/${res.disputeId}`);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-border bg-surface p-4 text-sm">
        <p className="font-semibold text-text-primary">{serviceName}</p>
        <p className="text-text-secondary">
          {role === "customer"
            ? "Tell us what went wrong. We'll bring your mechanic in to resolve it, and step in as mediator if needed."
            : "Flag an issue with this job. We'll notify the customer and mediate if it's not resolved between you."}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-text-primary">Reason</label>
        <Select<string> value={reason} onChange={setReason} options={[...reasons]} aria-label="Dispute reason" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-text-primary">What happened?</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="Describe the issue in as much detail as you can…"
          className="rounded-lg border border-border bg-surface-card px-3 py-2.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25 resize-none"
        />
        <span className={`text-xs ${description.trim().length < MIN_DESCRIPTION_CHARS ? "text-text-muted" : "text-success"}`}>
          {description.trim().length}/{MIN_DESCRIPTION_CHARS} characters minimum
        </span>
      </div>

      {/* Photos */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-text-primary">
          Photos <span className="font-normal text-text-muted">(optional, up to {MAX_DISPUTE_PHOTOS})</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {photos.map((url) => (
            <div key={url} className="relative size-20 overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="size-full object-cover" />
              <button
                type="button"
                onClick={() => setPhotos((p) => p.filter((u) => u !== url))}
                className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white"
                aria-label="Remove photo"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {photos.length < MAX_DISPUTE_PHOTOS && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex size-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-text-muted transition-colors hover:border-brand-blue/50 hover:text-brand-blue disabled:opacity-50"
            >
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
              <span className="text-[10px]">Add</span>
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Refund request — customers only */}
      {role === "customer" && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-text-primary">What are you looking for?</label>
          {(
            [
              { k: "full", label: `Full refund (${formatPrice(totalPence)})` },
              { k: "partial", label: "Partial refund" },
              { k: "none", label: "Not after a refund — just flagging it" },
            ] as { k: RefundRequestKind; label: string }[]
          ).map((opt) => (
            <label key={opt.k} className="flex items-center gap-2.5 text-sm text-text-primary">
              <input
                type="radio"
                name="refund"
                checked={refundKind === opt.k}
                onChange={() => setRefundKind(opt.k)}
                className="size-4 text-brand-blue focus:ring-brand-blue/30"
              />
              {opt.label}
            </label>
          ))}
          {refundKind === "partial" && (
            <input
              type="text"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              placeholder="£ amount"
              inputMode="decimal"
              className="mt-1 h-11 w-40 rounded-lg border border-border bg-surface-card px-3 text-sm text-text-primary outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25"
            />
          )}
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">{error}</p>}

      <Button
        variant="primary"
        size="lg"
        onClick={submit}
        disabled={pending || uploading}
        iconLeft={pending ? Loader2 : undefined}
        className="self-start"
      >
        {pending ? "Submitting…" : "Submit dispute"}
      </Button>
    </div>
  );
}
