-- 0019_customer_dashboard_and_messaging.sql
-- Task 09 — customer dashboard, reschedule responses, and in-app messaging.
--
-- Adds:
--   1. Extra booking_events types so the customer's reschedule accept/decline
--      and the in-app messaging both leave an audit trail. Also back-fills
--      'payout_transferred' which Task 08's completeAndCharge already writes but
--      was never added to the CHECK (its insert silently failed under RLS).
--   2. `messages` — a per-booking thread between the customer and their assigned
--      mechanic (Task 09 Stage 2, messaging-only; live GPS stays deferred to the
--      native app build).
--
-- Saved vehicles are derived from the customer's own bookings (distinct
-- vehicle_reg) rather than a dedicated table — the editable saved-vehicles
-- store is deferred (see the Task 09 md). No schema needed for guest→account
-- linking either: RLS already matches logged-in customers to their guest
-- bookings by email, and link-guest-bookings.ts just stamps customer_id.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. booking_events event_type — additive. Keeps every existing type.
-- ---------------------------------------------------------------------------
alter table public.booking_events
  drop constraint if exists booking_events_event_type_check;
alter table public.booking_events
  add constraint booking_events_event_type_check
  check (event_type in (
    'created',
    'status_changed',
    'mechanic_assigned',
    'mechanic_reassigned',
    'reschedule_proposed',
    'reschedule_accepted',
    'reschedule_declined',
    'cancelled',
    'disputed',
    'payment_authorised',
    'payment_captured',
    'payout_transferred',
    'message_sent',
    'note'
  ));

-- ---------------------------------------------------------------------------
-- 2. messages — one thread per booking. Sender is whichever party (customer or
--    mechanic) is on the booking; admins can read all for support.
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id),
  -- 'customer' | 'mechanic' (denormalised so the UI can align bubbles without a
  -- join, and so a recipient's unread sweep can target the other role).
  sender_role text not null check (sender_role in ('customer', 'mechanic')),
  body       text not null check (length(btrim(body)) > 0),
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_booking_created_idx
  on public.messages (booking_id, created_at);

alter table public.messages enable row level security;

-- Customer on the booking (logged-in by id, or guest-linked by email) reads the
-- thread. Mirrors the bookings SELECT policy shape (0003).
drop policy if exists "Customers read own booking messages" on public.messages;
create policy "Customers read own booking messages" on public.messages
  for select using (
    exists (
      select 1 from public.bookings b
       where b.id = messages.booking_id
         and (
           b.customer_id = auth.uid()
           or (b.customer_id is null and b.customer_email = auth.email())
         )
    )
  );

-- Assigned mechanic reads the thread.
drop policy if exists "Mechanics read assigned booking messages" on public.messages;
create policy "Mechanics read assigned booking messages" on public.messages
  for select using (
    exists (
      select 1 from public.bookings b
       where b.id = messages.booking_id
         and b.mechanic_id = auth.uid()
    )
  );

drop policy if exists "Admins read all messages" on public.messages;
create policy "Admins read all messages" on public.messages
  for select using (public.is_admin());

-- Inserts go through the sendMessage server action (service-role) after it has
-- verified the caller is party to the booking — same privileged-write pattern
-- as job offers / job actions. No INSERT/UPDATE policy for browser sessions.
--
-- NOTE: the thread is kept live by client-side polling (lib/use-stay-fresh.ts),
-- NOT Supabase Realtime — so `messages` is deliberately NOT added to the
-- supabase_realtime publication. Nothing in the app depends on table
-- replication being enabled.
