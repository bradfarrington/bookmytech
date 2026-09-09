-- 0064_job_revisions.sql
-- The mechanic revises the job on site (Task 37 — Gareth's item 9 as Brad
-- clarified it on 2026-09-09): "the mechanic gets to site, realises it's the
-- wrong repair booked, gives the customer the option to proceed with the new
-- work whether it's an increased or decreased amount; if the customer refuses,
-- the mechanic charges either the cancellation fee or a diagnostic."
--
--   job_revisions — one proposed rewrite of the job sheet: the repairs and
--                   parts as booked (`before`) and as the mechanic now says
--                   they should be (`after`), both priced the way the checkout
--                   prices them (quoteRepairs), and the signed difference.
--
-- Every revision needs the customer's approval, cheaper or dearer (owner
-- decision 2026-09-09): the WORK changed, not just the price. What differs is
-- only the money path —
--   difference > 0  a second manual-capture hold for the difference, exactly
--                   Task 33's mechanism: `hold_quote_id` points at a job_quotes
--                   row (kind 'now') that carries the difference and is born
--                   'draft', flipped to 'approved' with the customer's card.
--   difference <= 0 no new hold; the base hold captures the lower figure at
--                   completion and Stripe releases the rest.
-- On approval the booking's job lines, parts and figures are REPLACED with the
-- `after` snapshot, so every reader — including the mobile app, which shows
-- total_pence as "what you pay" — sees the revised job. The hold quote keeps
-- completeAndCharge's arithmetic true with no change: the base hold captures
-- after − difference = before.
--
-- If the customer declines, the mechanic ends the job (booking → 'cancelled')
-- charging the on-site diagnostic fee, the en-route cancellation fee, or
-- nothing — captured from the base hold, the rest released, and the fee paid
-- out to the mechanic minus commission. No new booking status, so the app's
-- labels are untouched; the `cancelled` event carries the outcome.
--
-- RLS: SELECT for the booking's customer (id or guest email), the assigned
-- mechanic, and admins — the 0062 policy bodies. No write policies: every
-- write goes through the service-role client in lib/revisions/*. Published
-- over Realtime like job_quotes so the app's booking screen refreshes.
--
-- Idempotent: safe to re-run.

create table if not exists public.job_revisions (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null references public.bookings (id) on delete cascade,
  mechanic_id         uuid not null references public.profiles (id),
  status              text not null default 'sent'
                        check (status in ('sent', 'approved', 'declined', 'withdrawn', 'expired')),
  -- Why the booked repair isn't right — the customer reads this.
  reason              text not null check (char_length(reason) between 1 and 500),
  note                text,
  -- The job sheet as booked and as revised: lines, parts, description,
  -- duration, oil and the five money figures. Same shape both sides
  -- (lib/revisions/snapshot.ts). Snapshotted so the customer's approval page
  -- and the audit trail never depend on a later HaynesPro reprice.
  before              jsonb not null,
  after               jsonb not null,
  after_repair_ids    text[] not null,
  before_total_pence  integer not null check (before_total_pence >= 0),
  after_total_pence   integer not null check (after_total_pence >= 0),
  -- after − before. Positive = the customer authorises the difference on
  -- their card; zero or negative = nothing to authorise.
  difference_pence    integer not null,
  hold_quote_id       uuid references public.job_quotes (id) on delete set null,
  sent_at             timestamptz,
  responded_at        timestamptz,
  expires_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (difference_pence = after_total_pence - before_total_pence),
  check ((difference_pence > 0) = (hold_quote_id is not null) or status <> 'sent')
);
create index if not exists job_revisions_booking_idx on public.job_revisions (booking_id, created_at);
create index if not exists job_revisions_sent_idx on public.job_revisions (status) where status = 'sent';

-- The on-site diagnostic fee (admin-set, Gareth: "a diagnostic (set by you)").
-- Seeded to match the catalogue's diagnostic products; edited on /admin/pricing.
insert into public.platform_settings (key, value)
values ('on_site_diagnostic_fee_pence', '5999')
on conflict (key) do nothing;

-- RLS ------------------------------------------------------------------------
alter table public.job_revisions enable row level security;

drop policy if exists "Customers read own revisions" on public.job_revisions;
create policy "Customers read own revisions" on public.job_revisions
  for select using (
    exists (
      select 1 from public.bookings b
       where b.id = job_revisions.booking_id
         and (b.customer_id = auth.uid() or (b.customer_id is null and b.customer_email = auth.email()))
    )
  );
drop policy if exists "Mechanics read own revisions" on public.job_revisions;
create policy "Mechanics read own revisions" on public.job_revisions
  for select using (mechanic_id = auth.uid());
drop policy if exists "Admins read all revisions" on public.job_revisions;
create policy "Admins read all revisions" on public.job_revisions
  for select using (public.is_admin());

-- Realtime (config only; same guard as 0058 / 0062).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'job_revisions'
  ) then
    alter publication supabase_realtime add table public.job_revisions;
  end if;
end $$;

-- Events: five new types. Ending the job on site reuses 'cancelled' (payload
-- cancelled_by 'mechanic', outcome 'customer_declined_revision', fee_kind,
-- fee_pence) and 'payment_captured' (kind 'on_site_diagnostic' |
-- 'on_site_cancellation'), so no new booking status and no new label for the
-- app to learn. The list is 0062's plus these.
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
    'note',
    'arrival_window_set',
    'fault_added',
    'quote_sent',
    'quote_approved',
    'quote_declined',
    'quote_withdrawn',
    'quote_expired',
    'revision_sent',
    'revision_approved',
    'revision_declined',
    'revision_withdrawn',
    'revision_expired'
  ));

comment on table public.job_revisions is
  'The mechanic''s on-site rewrite of the job sheet (Task 37): before/after snapshots priced like the checkout, the signed difference, and the job_quotes hold that carries a positive difference. Every revision needs the customer''s approval; on approval the booking''s lines, parts and figures are replaced with `after`.';
