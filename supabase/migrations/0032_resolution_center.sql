-- 0032_resolution_center.sql
-- Resolution Center — an INTERNAL mechanic ↔ admin channel for raising issues
-- about a specific job (e.g. "I can't complete this job, please redistribute").
--
-- Deliberately SEPARATE from the customer-facing `disputes` system (0025):
--   * disputes are 3-party (customer/mechanic/admin), one-per-booking, and wired
--     to refunds / credits / payout holds.
--   * resolution cases are 2-party (mechanic/admin ONLY), many-per-booking, never
--     visible to or notifying the customer. The only customer contact is an
--     admin-initiated email/SMS sent from the case workbench.
--
-- Adds:
--   1. resolution_reasons — admin-configurable reason list for the raise dropdown.
--   2. resolution_cases   — one row per raised case (NOT unique per booking).
--   3. resolution_messages — internal 2-party thread (mechanic + admin).
--   4. booking_events: new resolution event types so the job timeline stays whole.
--
-- Privileged-write pattern (like 0025/0030/0031): browser gets scoped SELECT
-- only; all INSERT/UPDATE go through the service-role client in
-- app/actions/resolutions.ts after a role check.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. resolution_reasons — admin-configurable reasons
-- ---------------------------------------------------------------------------
create table if not exists public.resolution_reasons (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resolution_reasons_active_idx
  on public.resolution_reasons (active, sort_order);

alter table public.resolution_reasons enable row level security;

-- Mechanics + admins may READ the reason list (to populate the dropdown).
-- Customers must not — no policy grants them access. Writes go through the
-- service-role admin client after an admin check.
drop policy if exists "Staff read resolution reasons" on public.resolution_reasons;
create policy "Staff read resolution reasons" on public.resolution_reasons
  for select using (
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid() and p.role in ('admin', 'mechanic')
    )
  );

-- Seed a sensible default set. `on conflict do nothing` keyed on label so a
-- re-run never duplicates or clobbers admin edits.
create unique index if not exists resolution_reasons_label_key
  on public.resolution_reasons (label);

insert into public.resolution_reasons (label, sort_order) values
  ('Can''t complete this job',            10),
  ('Customer unreachable',                20),
  ('Vehicle/access issue on arrival',     30),
  ('Scope larger than booked',            40),
  ('Parts unavailable',                   50),
  ('Safety concern',                      60),
  ('Other',                               99)
on conflict (label) do nothing;

-- ---------------------------------------------------------------------------
-- 2. resolution_cases
-- ---------------------------------------------------------------------------
create table if not exists public.resolution_cases (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references public.bookings(id) on delete cascade,
  -- The mechanic the case is about (the assigned mechanic when it was raised).
  mechanic_id    uuid not null references public.profiles(id),
  opened_by      uuid references public.profiles(id),
  opened_by_role text not null check (opened_by_role in ('mechanic', 'admin')),
  reason_id      uuid references public.resolution_reasons(id),
  -- Snapshot of the reason label so later reason edits/deletes don't rewrite
  -- history.
  reason_label   text not null,
  description    text not null,
  status         text not null default 'open'
                   check (status in ('open', 'in_progress', 'resolved', 'closed')),
  -- True once the admin has re-broadcast the job from this case.
  redistributed  boolean not null default false,
  resolution_note text,
  resolved_by    uuid references public.profiles(id),
  resolved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists resolution_cases_status_idx
  on public.resolution_cases (status, created_at desc);
create index if not exists resolution_cases_mechanic_idx
  on public.resolution_cases (mechanic_id, created_at desc);
create index if not exists resolution_cases_booking_idx
  on public.resolution_cases (booking_id);

alter table public.resolution_cases enable row level security;

-- Mechanic sees their own cases; admin sees all. No customer policy.
drop policy if exists "Mechanics read own resolution cases" on public.resolution_cases;
create policy "Mechanics read own resolution cases" on public.resolution_cases
  for select using (mechanic_id = auth.uid() or opened_by = auth.uid());

drop policy if exists "Admins read all resolution cases" on public.resolution_cases;
create policy "Admins read all resolution cases" on public.resolution_cases
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. resolution_messages — internal 2-party thread (mechanic + admin)
-- ---------------------------------------------------------------------------
create table if not exists public.resolution_messages (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.resolution_cases(id) on delete cascade,
  sender_id   uuid references public.profiles(id),
  sender_role text not null check (sender_role in ('mechanic', 'admin')),
  body        text not null check (length(btrim(body)) > 0),
  created_at  timestamptz not null default now()
);

create index if not exists resolution_messages_case_idx
  on public.resolution_messages (case_id, created_at);

alter table public.resolution_messages enable row level security;

drop policy if exists "Case mechanic reads thread" on public.resolution_messages;
create policy "Case mechanic reads thread" on public.resolution_messages
  for select using (
    exists (
      select 1 from public.resolution_cases c
       where c.id = resolution_messages.case_id
         and (c.mechanic_id = auth.uid() or c.opened_by = auth.uid())
    )
  );

drop policy if exists "Admins read resolution threads" on public.resolution_messages;
create policy "Admins read resolution threads" on public.resolution_messages
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. booking_events — additive event types for the resolution lifecycle
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
    'resolution_opened',
    'resolution_redistributed',
    'payment_authorised',
    'payment_captured',
    'payment_refunded',
    'payout_transferred',
    'payout_reversed',
    'message_sent',
    'note'
  ));
