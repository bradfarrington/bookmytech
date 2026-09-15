"use client";

import { useState } from "react";
import { Check, Copy, Gift, Share2 } from "lucide-react";
import { REFERRAL_BONUS_PENCE, REFERRAL_WELCOME_PENCE } from "@/lib/credits/constants";
import { formatPrice } from "@/lib/utils";
import { Button, Overline, Panel, Tile } from "@/components/dashboard/ui";

// The referral card (Task 11 Stage 3), in the dashboard's building blocks. The
// friend gets REFERRAL_WELCOME_PENCE off their first booking; the customer gets
// REFERRAL_BONUS_PENCE once that friend completes a job.
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
  const give = formatPrice(REFERRAL_WELCOME_PENCE);
  const get = formatPrice(REFERRAL_BONUS_PENCE);

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the code is on screen to copy by hand.
    }
  }

  async function share() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: "Book My Tech",
          text: `Get ${give} off your first mobile mechanic booking with Book My Tech.`,
          url: shareUrl,
        });
        return;
      } catch {
        // Cancelled or unsupported: fall back to copying.
      }
    }
    copy();
  }

  return (
    <Panel padding="lg">
      <div className="flex items-start gap-3">
        <Tile icon={Gift} />
        <div className="min-w-0">
          <div className="font-display text-base font-bold leading-[22px] tracking-[-0.2px] text-text-primary">
            Give {give}, get {get}
          </div>
          <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">
            Friends get {give} off their first booking, and you get {get} when they complete it.
          </p>
        </div>
      </div>

      {creditPence > 0 && (
        <div className="mt-3.5 rounded-[10px] border border-green-200 bg-green-50 px-3 py-2 text-[13px] font-semibold leading-[19px] text-green-800">
          You have {formatPrice(creditPence)} in credit. It&apos;s applied automatically at checkout.
        </div>
      )}

      <div className="mt-3.5 flex items-center justify-between gap-3 rounded-[10px] border border-border bg-surface px-3 py-2.5">
        <Overline>Your code</Overline>
        <span className="truncate font-mono text-[15px] font-bold tracking-wider text-text-primary">{code}</span>
      </div>

      <div className="mt-2.5 flex gap-2">
        <Button icon={copied ? Check : Copy} className="flex-1" onClick={copy}>
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button variant="secondary" icon={Share2} className="w-11 px-0" aria-label="Share" onClick={share}>
          <span className="sr-only">Share</span>
        </Button>
      </div>
    </Panel>
  );
}
