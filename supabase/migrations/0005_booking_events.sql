-- Task 04 Stage 1 — booking events audit table.
--
-- Every status change, assignment, cancellation, dispute flag, and admin note
-- writes a row. Powers the booking-detail timeline in the admin UI and gives
-- us a real audit trail for the eventual disputes flow (task 12).
--
-- One booking has many events. Inserts are write-only — never UPDATE or DELETE
-- rows here; if a fact about an event was wrong, write a corrective event.
--
-- Idempotent: safe to re-run.

create table if not exists booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  event_type text not null check (event_type in (
    'created',
    'status_changed',
    'mechanic_assigned',
    'mechanic_reassigned',
    'cancelled',
    'disputed',
    'payment_authorised',
    'payment_captured',
    'note'
  )),
  actor_id uuid references profiles(id) on delete set null,
  actor_role text check (
    actor_role is null
    or actor_role in ('customer', 'mechanic', 'admin', 'system')
  ),
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists booking_events_booking_id_created_at_idx
  on booking_events (booking_id, created_at desc);

alter table booking_events enable row level security;

drop policy if exists "Admins can view all booking events" on booking_events;
create policy "Admins can view all booking events" on booking_events
  for select using (public.is_admin());

drop policy if exists "Admins can insert booking events" on booking_events;
create policy "Admins can insert booking events" on booking_events
  for insert with check (public.is_admin());

-- Customers see events on their own bookings. The inline EXISTS on `bookings`
-- is safe here — it's a different table, so no recursion risk. Performance is
-- fine because customer reads are rare and the `(booking_id, created_at)`
-- index supports the lookup.
drop policy if exists "Customers can view events on own bookings" on booking_events;
create policy "Customers can view events on own bookings" on booking_events
  for select using (
    exists (
      select 1
        from bookings b
       where b.id = booking_events.booking_id
         and (
           b.customer_id = auth.uid()
           or (b.customer_id is null and b.customer_email = auth.email())
         )
    )
  );

-- Mechanic-side SELECT policy is intentionally NOT added here. It lands in
-- task 05 (mechanic dashboard) when the assignment relationship is wired up.
