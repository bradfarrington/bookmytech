-- 0008_job_offers.sql
-- Task 05 Stage 2 — broadcast dispatch + job offers.
--
-- DISPATCH MODEL (owner decision, 2026-06-01): broadcast, first-to-accept.
-- When a booking is created it is offered SIMULTANEOUSLY to every eligible
-- online mechanic (service area covers the job address, matching specialism).
-- The first to accept wins; their accept assigns the booking and supersedes all
-- sibling offers. There is no per-offer expiry / sequential hand-off and no
-- auto-widening of radius. The only escalation is: if a booking is still
-- unaccepted 5 minutes after creation, the admin is notified (see the
-- /api/cron/dispatch-sweep route). The spec's "expires_at / 60s" wording is
-- superseded — there is deliberately NO expires_at column.

create table if not exists public.job_offers (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  mechanic_id  uuid not null references public.mechanics(id) on delete cascade,
  offered_at   timestamptz not null default now(),
  responded_at timestamptz,
  -- 'accepted' = this mechanic won it; 'declined' = they passed;
  -- 'superseded' = another mechanic accepted first. null = still live.
  response     text check (response in ('accepted', 'declined', 'superseded')),
  created_at   timestamptz not null default now(),
  unique (booking_id, mechanic_id)
);

-- Feed query: a mechanic's still-live offers.
create index if not exists job_offers_pending_idx
  on public.job_offers (mechanic_id) where response is null;
-- Supersede-siblings + booking lookups.
create index if not exists job_offers_booking_idx
  on public.job_offers (booking_id);

alter table public.job_offers enable row level security;

-- Mechanics read their own offers (powers the live feed + realtime).
create policy "Mechanics can view own offers" on public.job_offers
  for select using (auth.uid() = mechanic_id);

-- Admins read everything.
create policy "Admins can view all offers" on public.job_offers
  for select using (public.is_admin());

-- NOTE: no INSERT/UPDATE policies. All writes (dispatch fan-out, accept,
-- decline, supersede) go through server actions using the service-role client,
-- which bypasses RLS. Accept is a privileged, atomic operation (assigns the
-- booking + supersedes siblings) that can't be expressed as a row policy.

-- ---------------------------------------------------------------------------
-- Commission rate locked at booking time. Earnings (mechanic share) are
-- derived from this, never a hardcoded 15% (see lib/earnings.ts). Pro-tier
-- discounts (Task 11) will set a lower rate per booking at creation.
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists commission_rate numeric(4,3) not null default 0.150;

-- ---------------------------------------------------------------------------
-- Mechanic-side visibility into bookings + events (the data-model's
-- "added in Task 05" policies).
-- ---------------------------------------------------------------------------

-- Assigned mechanic can read their booking (schedule, job detail, KPIs).
create policy "Mechanics can view assigned bookings" on public.bookings
  for select using (auth.uid() = mechanic_id);

-- A mechanic can read a booking they currently hold an offer for, so the
-- offer card can show its details before anyone has accepted (mechanic_id is
-- still null at that point). Cross-table EXISTS on job_offers — no recursion
-- (job_offers policies never reference bookings).
create policy "Mechanics can view offered bookings" on public.bookings
  for select using (
    exists (
      select 1 from public.job_offers o
      where o.booking_id = bookings.id and o.mechanic_id = auth.uid()
    )
  );

-- Assigned mechanic can read the booking's event timeline.
create policy "Mechanics can view events on assigned bookings" on public.booking_events
  for select using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_events.booking_id and b.mechanic_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Realtime: the mechanic feed subscribes to job_offers changes. Add the table
-- to the supabase_realtime publication so inserts/updates broadcast. Idempotent.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'job_offers'
  ) then
    alter publication supabase_realtime add table public.job_offers;
  end if;
end $$;
