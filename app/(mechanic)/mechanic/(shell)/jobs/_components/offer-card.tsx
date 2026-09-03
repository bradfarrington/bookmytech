"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MapPin, Wrench, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Icon } from "@/components/ui/icon";
import { formatPrice } from "@/lib/utils";
import { acceptOffer, declineOffer } from "@/app/actions/job-offers";
import type { OfferView } from "./offer-feed";

// "just now" / "2m ago" / "1h ago" — recomputed each render and on a 30s tick.
function offeredAgo(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

export function OfferCard({ offer }: { offer: OfferView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [, forceTick] = useState(0);

  // Re-render the "offered Xm ago" label every 30s.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  function handleAccept() {
    startTransition(async () => {
      const result = await acceptOffer(offer.id);
      if (!result.ok) {
        toast.error(result.error);
        router.refresh();
        return;
      }
      // An all-day job: straight to the job page, where the arrival-window
      // picker is the first thing they see (Task 21). Anything else stays on
      // the feed.
      if (result.needsArrivalWindow && result.bookingId) {
        toast.success("Job accepted — now pick an arrival window.");
        router.push(`/mechanic/jobs/${result.bookingId}`);
        return;
      }
      toast.success("Job accepted — it's yours.");
      router.refresh();
    });
  }

  function handleDecline() {
    startTransition(async () => {
      const result = await declineOffer(offer.id);
      if (!result.ok) {
        toast.error(result.error);
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 border-b border-border-subtle p-5 last:border-b-0 sm:flex-row sm:items-center">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-50">
        <Icon icon={Wrench} size={20} className="text-brand-blue" />
      </div>

      <Link
        href={`/mechanic/offer/${offer.id}`}
        className="min-w-0 flex-1 rounded-lg transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
      >
        <div className="mb-1 flex items-center gap-2">
          <h3 className="truncate text-sm font-bold text-text-primary">
            {offer.serviceName}
          </h3>
          <Pill tone="accent">
            <Icon icon={Zap} size={11} /> New · {offeredAgo(offer.offeredAt)}
          </Pill>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-secondary">
          <span className="font-medium">
            {offer.vehicle}
            {offer.reg ? ` · ${offer.reg}` : ""}
          </span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Icon icon={MapPin} size={11} className="text-text-muted" />
            {offer.area}
            {offer.distanceLabel ? ` · ${offer.distanceLabel}` : ""}
          </span>
          <span aria-hidden>·</span>
          <span>{offer.slot}</span>
        </div>
      </Link>

      <div className="shrink-0 text-right">
        <div className="text-[11px] font-semibold text-text-muted">You earn</div>
        <div className="text-xl font-extrabold tracking-tight text-text-primary">
          {formatPrice(offer.earningsPence)}
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDecline}
          disabled={pending}
        >
          Decline
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleAccept}
          disabled={pending}
        >
          Accept
        </Button>
      </div>
    </div>
  );
}
