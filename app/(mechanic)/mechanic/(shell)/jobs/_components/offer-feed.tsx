"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Icon } from "@/components/ui/icon";
import { subscribeToMyOffers } from "@/lib/supabase/realtime";
import { OfferCard } from "./offer-card";

export interface OfferView {
  id: string;
  bookingId: string;
  offeredAt: string;
  serviceName: string;
  vehicle: string;
  reg: string;
  area: string;
  distanceLabel: string | null;
  slot: string;
  earningsPence: number;
}

export function OfferFeed({
  mechanicId,
  offers,
}: {
  mechanicId: string;
  offers: OfferView[];
}) {
  const router = useRouter();

  // New offers (insert) and resolved offers (accepted/declined/superseded
  // update) both refresh the server component, which re-queries live offers.
  useEffect(() => {
    return subscribeToMyOffers(mechanicId, () => router.refresh());
  }, [mechanicId, router]);

  return (
    <Card padded={false}>
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <span
          className="size-2 rounded-full bg-danger"
          style={{ boxShadow: "0 0 0 4px rgba(239,68,68,0.2)" }}
        />
        <h2 className="text-[15px] font-bold text-text-primary">New jobs near you</h2>
        <Pill tone="error">{offers.length} live</Pill>
        <div className="flex-1" />
        <span className="text-[11px] text-text-muted">Auto-updates</span>
      </div>

      {offers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-border-subtle">
            <Icon icon={Inbox} size={22} className="text-text-muted" />
          </div>
          <p className="text-sm font-semibold text-text-primary">
            No new jobs right now
          </p>
          <p className="max-w-xs text-xs leading-relaxed text-text-muted">
            Make sure you&apos;re online and your service area is set. New jobs in
            your area will appear here the moment they&apos;re booked.
          </p>
        </div>
      ) : (
        <div>
          {offers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} />
          ))}
        </div>
      )}
    </Card>
  );
}
