"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { useStayFresh } from "@/lib/use-stay-fresh";
import { Caption, LiveDot, Panel } from "@/components/dashboard/ui";
import { clockLabel } from "../../../_home/booking-logic";

// Where the mechanic is, while they're on the way. Reads `mechanic_locations`
// with the browser client, so the RLS policy "Customers track their en-route
// mechanic" (0048) decides: sharing on, a fix from the last five minutes, and
// one of this customer's bookings with them en route. Anything else returns no
// row and this renders nothing: no placeholder, no guessed position.

const LiveLocationMap = dynamic(() => import("./live-location-map"), {
  ssr: false,
  loading: () => <div aria-hidden className="h-44 w-full animate-pulse bg-gradient-to-br from-blue-100 to-blue-50" />,
});

interface Fix {
  lat: number;
  lng: number;
  updatedAt: string;
}

/** The mechanic's latest fix the customer may see, or null. */
async function fetchFix(mechanicId: string): Promise<Fix | null> {
  try {
    const { data, error } = await createClient()
      .from("mechanic_locations")
      .select("lat, lng, updated_at")
      .eq("mechanic_id", mechanicId)
      .maybeSingle();
    const lat = Number(data?.lat);
    const lng = Number(data?.lng);
    if (error || !data || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, updatedAt: String(data.updated_at) };
  } catch {
    return null;
  }
}

export function LiveLocation({ mechanicId, mechanicName }: { mechanicId: string; mechanicName: string }) {
  const [fix, setFix] = useState<Fix | null>(null);

  useEffect(() => {
    let active = true;
    fetchFix(mechanicId).then((next) => {
      if (active) setFix(next);
    });
    return () => {
      active = false;
    };
  }, [mechanicId]);

  const refresh = useCallback(() => {
    fetchFix(mechanicId).then(setFix);
  }, [mechanicId]);
  useStayFresh(refresh, 15_000);

  if (!fix) return null;

  const updated = new Date(fix.updatedAt);
  return (
    <Panel padding="none">
      <LiveLocationMap lat={fix.lat} lng={fix.lng} label={mechanicName} />
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <LiveDot />
        <Caption>
          {mechanicName === "Your mechanic" ? "Your mechanic's" : `${mechanicName}'s`} location, shared while
          they&apos;re on the way
          {Number.isNaN(updated.getTime()) ? "." : `. Updated at ${clockLabel(updated)}.`}
        </Caption>
      </div>
    </Panel>
  );
}
