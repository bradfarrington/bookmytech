"use client";

import { useState } from "react";
import { Gift, Copy, Check, Share2 } from "lucide-react";
import { formatPrice } from "@/lib/utils";

// Give-£10-get-£10 referral card (Task 11 Stage 3). The referee gets credit off
// their first booking; the referrer gets credit once the referee completes a job.
export function ReferralCard({
  code,
  shareUrl,
  creditPence,
}: {
  code: string;
  shareUrl: string;
  creditPence: number;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — no-op; the code is on screen to copy manually
    }
  }

  async function share() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: "Book My Tech",
          text: "Get £10 off your first mobile mechanic booking with Book My Tech.",
          url: shareUrl,
        });
        return;
      } catch {
        // user cancelled or unsupported — fall through to copy
      }
    }
    copy();
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-brand-blue to-brand-blue-dark p-6 text-white">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15">
          <Gift size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold">Give £10, get £10</h2>
          <p className="mt-0.5 text-sm text-blue-100">
            Share your code. Friends get {formatPrice(1000)} off their first booking,
            and you get {formatPrice(1000)} when they complete it.
          </p>
        </div>
      </div>

      {creditPence > 0 && (
        <p className="mt-4 rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold">
          You have {formatPrice(creditPence)} in credit — it&apos;s applied automatically at checkout.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 items-center justify-between rounded-lg bg-white/15 px-3 py-2.5">
          <span className="text-xs uppercase tracking-wide text-blue-100">Your code</span>
          <span className="font-mono text-base font-bold tracking-wider">{code}</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copy}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-4 text-sm font-semibold text-brand-blue transition-colors hover:bg-blue-50"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copied!" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={share}
            aria-label="Share"
            className="inline-flex size-11 items-center justify-center rounded-lg bg-white/15 text-white transition-colors hover:bg-white/25"
          >
            <Share2 size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
