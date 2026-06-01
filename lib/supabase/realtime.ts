import { createClient } from "@/lib/supabase/client";

// Subscribe to any change on the bookings table and invoke `onChange`.
//
// Uses the browser client, which carries the signed-in admin's session via
// cookies — so Realtime's RLS check passes (admins can read all bookings).
//
// Requires Realtime replication to be enabled for `public.bookings` in the
// Supabase dashboard (Database → Replication). Until it's on, the channel
// simply never fires; the table still renders from its server-fetched props.
//
// Returns an unsubscribe function — call it from a useEffect cleanup.
export function subscribeToBookings(onChange: () => void): () => void {
  const supabase = createClient();
  const channel = supabase
    .channel("admin-bookings-monitor")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "bookings" },
      () => onChange(),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// Subscribe to a mechanic's own job_offers. Fires on insert (new offer arrives)
// and on update (an offer was accepted/declined/superseded → drops off the
// feed). Filtered server-side to this mechanic, and RLS ("Mechanics can view
// own offers") also scopes it.
//
// Requires Realtime replication on `public.job_offers` — migration 0008 adds
// the table to the supabase_realtime publication, so this works once 0008 is
// applied. Returns an unsubscribe function for useEffect cleanup.
export function subscribeToMyOffers(
  mechanicId: string,
  onChange: () => void,
): () => void {
  const supabase = createClient();
  const channel = supabase
    .channel(`mechanic-offers-${mechanicId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "job_offers",
        filter: `mechanic_id=eq.${mechanicId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
