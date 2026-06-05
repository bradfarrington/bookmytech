-- 0023_rebooking_and_reminders.sql
-- Task 11 Stage 1 — frictionless rebooking + proactive service reminders.
--
-- Adds:
--   1. bookings.preferred_mechanic_id — set when a customer rebooks with the
--      "same mechanic if available" toggle on. dispatchBooking offers the job
--      exclusively to this mechanic when they're online + eligible; otherwise it
--      falls back to a normal broadcast (see lib/dispatch/dispatch.ts).
--   2. profiles reminder-preference columns — customers can opt out of reminders
--      entirely or pick channels (email / SMS). Push is deferred to the native
--      app, so there is no push channel here.
--   3. reminder_schedules — the queue of future service reminders (MOT due,
--      annual service, seasonal, post-job). Rows are created at job completion
--      (and back-filled by the daily scheduler cron) with a future scheduled_for;
--      the hourly sender cron emails/SMSes the ones that are due.
--
-- Privileged-write pattern (same as funnel_events / booking_events): no public
-- INSERT/UPDATE policy — all writes go through the service-role client in the
-- cron routes + completeAndCharge. Customers/admins get SELECT only.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Same-mechanic rebooking
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists preferred_mechanic_id uuid references public.profiles(id);

-- ---------------------------------------------------------------------------
-- 2. Customer reminder preferences (default: on, email only)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists reminders_enabled  boolean not null default true,
  add column if not exists reminder_via_email boolean not null default true,
  add column if not exists reminder_via_sms   boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. reminder_schedules
-- ---------------------------------------------------------------------------
create table if not exists public.reminder_schedules (
  id                      uuid primary key default gen_random_uuid(),
  -- Nullable for guest bookings (no account); customer_email reaches them either way.
  customer_id             uuid references public.profiles(id) on delete cascade,
  customer_email          text,
  vehicle_reg             text not null,
  reminder_type           text not null check (reminder_type in (
                            'mot_due',
                            'annual_service',
                            'winter_battery',
                            'summer_aircon',
                            'brake_check'
                          )),
  scheduled_for           timestamptz not null,
  sent_at                 timestamptz,
  -- Stamped when the customer clicks the reminder's CTA (click-through tracking).
  acted_on_at             timestamptz,
  -- Service slug the reminder deep-links to (e.g. 'mot-pre-check').
  service_suggestion_slug text,
  -- Opaque token in the email/SMS link → /r/<token> marks acted_on_at + redirects.
  token                   text not null unique default replace(gen_random_uuid()::text, '-', ''),
  source_booking_id       uuid references public.bookings(id) on delete set null,
  created_at              timestamptz not null default now()
);

-- One reminder per (car, type, scheduled day) — lets the scheduler upsert
-- idempotently across re-runs and across multiple bookings for the same car.
create unique index if not exists reminder_schedules_natural_key
  on public.reminder_schedules (vehicle_reg, reminder_type, scheduled_for);

-- Sender cron scans by due-and-unsent.
create index if not exists reminder_schedules_due_idx
  on public.reminder_schedules (scheduled_for)
  where sent_at is null;

alter table public.reminder_schedules enable row level security;

-- Customer reads their own reminders (linked by id, or guest-linked by email).
drop policy if exists "Customers read own reminders" on public.reminder_schedules;
create policy "Customers read own reminders" on public.reminder_schedules
  for select using (
    customer_id = auth.uid()
    or (customer_id is null and customer_email = auth.email())
  );

drop policy if exists "Admins read all reminders" on public.reminder_schedules;
create policy "Admins read all reminders" on public.reminder_schedules
  for select using (public.is_admin());
