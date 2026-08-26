-- 0049_realtime_bookings_and_locations.sql
-- Publish `bookings` and `mechanic_locations` over Supabase Realtime (Task 19 / P2).
--
-- DATA/CONFIG ONLY — no table, column or type changes, so nothing here affects
-- the TypeScript types the mobile app generates from the schema.
--
-- WHY
--
-- The only table in `supabase_realtime` was `job_offers` (0008, for the mechanic
-- offer feed). The mobile app's dashboard has subscribed to `bookings` since
-- phase 4 and has been silently falling back to its foreground refetch the whole
-- time — a subscription to an unpublished table gets no events and no error.
-- Its map card subscribes to `mechanic_locations` (0048), which needs the same.
--
-- The website is unaffected: it polls (`lib/use-stay-fresh.ts`), by decision.
--
-- WHAT A CUSTOMER CAN SEE
--
-- Postgres-changes on a user-token channel honours RLS: a subscriber receives an
-- event only for rows the SELECT policies let them read. So this exposes
-- nothing the policies don't already allow — `Customers can view own bookings`
-- (0003) and `Customers track their en-route mechanic` (0048). The corollary
-- for `mechanic_locations` is documented on that policy: an UPDATE that takes a
-- row OUT of the customer's view (sharing off, job no longer en_route) emits
-- no event, so the app must treat silence as "hide the marker", and it does.
--
-- `messages` is deliberately NOT published. Both clients poll it, and a thread
-- doesn't need sub-second delivery.
--
-- After applying, run `node scripts/verify-mechanic-visibility.mjs` — a live
-- position is the one thing here that must not leak, and that script proves the
-- read policy from two customer sessions.
--
-- Same idempotent guard as 0008.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table public.bookings;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mechanic_locations'
  ) then
    alter publication supabase_realtime add table public.mechanic_locations;
  end if;
end $$;
