-- 0058_realtime_booking_events.sql
-- Publish `booking_events` over Supabase Realtime (Task 28 follow-up).
--
-- DATA/CONFIG ONLY — no table, column or type changes, so nothing here affects
-- the TypeScript types the mobile app generates from the schema.
--
-- WHY
--
-- The mobile app's booking detail screen now subscribes to the booking's row
-- AND its events, so the history list refreshes when the mechanic picks a day
-- and window (`arrival_window_set`) or anything else lands. `booking_events`
-- was never added to the publication, so that half of the subscription got no
-- events and no error — the same silent fallback 0049 fixed for `bookings`.
--
-- The website is unaffected: it polls (`lib/use-stay-fresh.ts`), by decision.
--
-- WHAT A CUSTOMER CAN SEE
--
-- Postgres-changes on a user-token channel honours RLS: a subscriber receives
-- an event only for rows the SELECT policies let them read, so this exposes
-- nothing the existing `booking_events` read policies don't already allow.
-- The table is append-only (0005), so INSERT is the only event that will fire.
--
-- Same idempotent guard as 0008 / 0049.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'booking_events'
  ) then
    alter publication supabase_realtime add table public.booking_events;
  end if;
end $$;
