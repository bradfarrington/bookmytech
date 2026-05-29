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
