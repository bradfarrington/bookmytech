-- 0025_disputes.sql
-- Task 12 Stage 1 — disputes resolution, mechanic flags & suspensions.
--
-- Adds:
--   1. disputes — one per booking. Raised by the customer (after a completed
--      job, within 48h) or the mechanic (refused sign-off etc.). Lifecycle:
--      opened → responded → escalated → resolved (or withdrawn). BMT is the
--      named mediator: parties try to resolve themselves; admin arbitrates only
--      on escalation.
--   2. dispute_messages — a THREE-party thread (customer / mechanic / admin).
--      The existing `messages` table is customer↔mechanic only, so disputes get
--      their own thread that the admin mediator can post into.
--   3. mechanic_flags — performance flags (dispute loss, low rating, etc.) shown
--      in the admin "needs attention" panel.
--   4. mechanic_suspensions — suspension history (reason, who, until when).
--      mechanics.is_suspended / suspended_until are the live dispatch gate.
--   5. booking_events: new dispute + payment-reversal/refund event types so the
--      booking timeline stays complete.
--
-- Privileged-write pattern: no browser INSERT/UPDATE policies — all writes go
-- through the service-role client in app/actions/disputes.ts + the escalation
-- cron. Parties get scoped SELECT; admin sees everything.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. disputes
-- ---------------------------------------------------------------------------
create table if not exists public.disputes (
  id                      uuid primary key default gen_random_uuid(),
  booking_id              uuid not null references public.bookings(id) on delete cascade,
  opened_by               uuid references public.profiles(id),
  opened_by_role          text not null check (opened_by_role in ('customer', 'mechanic')),
  reason_category         text not null,
  description             text not null,
  photos                  text[] not null default '{}',
  -- null when the opener isn't seeking money back ("just flagging").
  refund_requested_pence  integer,
  status                  text not null default 'opened'
                            check (status in ('opened', 'responded', 'escalated', 'resolved', 'withdrawn')),
  -- The other party's account, added when they first respond.
  response                text,
  responded_at            timestamptz,
  escalated_at            timestamptz,
  resolved_at             timestamptz,
  -- Resolution outcome.
  resolution              text check (resolution in (
                            'full_refund', 'partial_refund', 'no_refund',
                            'credit', 'in_mechanic_favour', 'withdrawn'
                          )),
  resolution_refund_pence integer,
  resolution_credit_pence integer,
  resolution_note         text,   -- customer-facing explanation
  resolved_by             uuid references public.profiles(id),
  resolved_by_role        text check (resolved_by_role in ('customer', 'mechanic', 'admin')),
  -- True once the mechanic's payout has been clawed back pending resolution.
  payout_held             boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- One active dispute per booking (1:1 for launch). A second insert is blocked.
create unique index if not exists disputes_booking_key on public.disputes (booking_id);
create index if not exists disputes_status_idx on public.disputes (status, created_at);

alter table public.disputes enable row level security;

drop policy if exists "Parties read own disputes" on public.disputes;
create policy "Parties read own disputes" on public.disputes
  for select using (
    exists (
      select 1 from public.bookings b
       where b.id = disputes.booking_id
         and (
           b.customer_id = auth.uid()
           or (b.customer_id is null and b.customer_email = auth.email())
           or b.mechanic_id = auth.uid()
         )
    )
  );

drop policy if exists "Admins read all disputes" on public.disputes;
create policy "Admins read all disputes" on public.disputes
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. dispute_messages — 3-party thread
-- ---------------------------------------------------------------------------
create table if not exists public.dispute_messages (
  id          uuid primary key default gen_random_uuid(),
  dispute_id  uuid not null references public.disputes(id) on delete cascade,
  sender_id   uuid references public.profiles(id),
  sender_role text not null check (sender_role in ('customer', 'mechanic', 'admin')),
  body        text not null check (length(btrim(body)) > 0),
  created_at  timestamptz not null default now()
);

create index if not exists dispute_messages_dispute_idx
  on public.dispute_messages (dispute_id, created_at);

alter table public.dispute_messages enable row level security;

drop policy if exists "Parties read dispute thread" on public.dispute_messages;
create policy "Parties read dispute thread" on public.dispute_messages
  for select using (
    exists (
      select 1
        from public.disputes d
        join public.bookings b on b.id = d.booking_id
       where d.id = dispute_messages.dispute_id
         and (
           b.customer_id = auth.uid()
           or (b.customer_id is null and b.customer_email = auth.email())
           or b.mechanic_id = auth.uid()
         )
    )
  );

drop policy if exists "Admins read dispute threads" on public.dispute_messages;
create policy "Admins read dispute threads" on public.dispute_messages
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. mechanic_flags
-- ---------------------------------------------------------------------------
create table if not exists public.mechanic_flags (
  id                 uuid primary key default gen_random_uuid(),
  mechanic_id        uuid not null references public.mechanics(id) on delete cascade,
  flag_type          text not null,  -- 'dispute_loss' | 'low_rating' | 'low_acceptance' | …
  severity           text not null default 'low' check (severity in ('low', 'medium', 'high')),
  related_dispute_id uuid references public.disputes(id) on delete set null,
  notes              text,
  -- Cleared when the underlying issue is resolved (e.g. rating recovers).
  resolved_at        timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists mechanic_flags_mechanic_idx on public.mechanic_flags (mechanic_id);

alter table public.mechanic_flags enable row level security;

drop policy if exists "Admins read mechanic flags" on public.mechanic_flags;
create policy "Admins read mechanic flags" on public.mechanic_flags
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. mechanic_suspensions + live gate on mechanics
-- ---------------------------------------------------------------------------
create table if not exists public.mechanic_suspensions (
  id              uuid primary key default gen_random_uuid(),
  mechanic_id     uuid not null references public.mechanics(id) on delete cascade,
  reason          text not null,
  suspended_by    uuid references public.profiles(id),
  suspended_at    timestamptz not null default now(),
  suspended_until timestamptz,  -- null = indefinite until manually lifted
  lifted_at       timestamptz,
  lifted_by       uuid references public.profiles(id)
);

create index if not exists mechanic_suspensions_mechanic_idx
  on public.mechanic_suspensions (mechanic_id, suspended_at desc);

alter table public.mechanic_suspensions enable row level security;

drop policy if exists "Admins read suspensions" on public.mechanic_suspensions;
create policy "Admins read suspensions" on public.mechanic_suspensions
  for select using (public.is_admin());

-- Mechanic can see their own suspension history (to render the banner).
drop policy if exists "Mechanics read own suspensions" on public.mechanic_suspensions;
create policy "Mechanics read own suspensions" on public.mechanic_suspensions
  for select using (mechanic_id = auth.uid());

alter table public.mechanics
  add column if not exists is_suspended    boolean not null default false,
  add column if not exists suspended_until timestamptz;

-- ---------------------------------------------------------------------------
-- 5. booking_events — additive event types for the dispute + money lifecycle
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
    'dispute_opened',
    'dispute_responded',
    'dispute_escalated',
    'dispute_resolved',
    'payment_authorised',
    'payment_captured',
    'payment_refunded',
    'payout_transferred',
    'payout_reversed',
    'message_sent',
    'note'
  ));
