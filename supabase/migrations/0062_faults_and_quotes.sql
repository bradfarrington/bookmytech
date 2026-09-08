-- 0062_faults_and_quotes.sql
-- Faults the mechanic finds on the job, and quotes for extra work (Task 33,
-- Gareth's change list 2026-09-08): "allow mechanics to adjust the labour and
-- parts if need be with a button to add labour and parts", "a box where
-- mechanics can add faults if they encounter more issues on the job", and "an
-- automatic quote tool for mechanics to quote customers for additional work or
-- follow-on quotes".
--
-- The customer T&Cs already require it (app/(customer)/terms/content.ts,
-- "Customer Approval of Additional Work"): "Additional work must not be
-- carried out until customer approval has been obtained through Book My
-- Tech". Until now nothing implemented that — no price could change after
-- booking, for anyone.
--
--   booking_faults   — a fault the mechanic noted (free text + severity).
--   job_quotes       — a quote: `kind`
--                        now       = extra work on THIS visit; approved with a
--                                    second Stripe hold, captured at completion
--                        follow_on = a return visit; approval leads into the
--                                    booking funnel (Task 34)
--                        reduction = the mechanic lowered the price (no
--                                    approval needed — the customer pays less);
--                                    total_pence is NEGATIVE and is realised
--                                    at capture
--                      with the platform figures snapshotted the way a
--                      booking's are (hourly rate, commission, fee, payout).
--   job_quote_lines  — labour (hours × the platform rate, optionally a
--                      HaynesPro node whose book time filled the hours in),
--                      parts (from the catalogue or typed), or other.
--
-- On approval of a `now` quote the booking's own figures (total_pence,
-- base_price_pence, parts_price_pence, platform_fee_pence,
-- mechanic_payout_pence) are INCREMENTED IN PLACE — the mobile app shows
-- total_pence as "what you pay", and after approving a quote the true figure
-- is the new one. The quote rows are the audit trail; a `quote_approved`
-- event carries before/after.
--
-- RLS: SELECT for the booking's customer (id or guest email — the 0055
-- policy body), the assigned mechanic, and admins. No write policies: every
-- write goes through the service-role client in lib/quotes/*.
-- job_quotes is published over Realtime (same guard as 0058) so the app's
-- booking screen can refresh when a quote arrives; the website polls.
--
-- Idempotent: safe to re-run.

create table if not exists public.job_quotes (
  id                       uuid primary key default gen_random_uuid(),
  booking_id               uuid not null references public.bookings (id) on delete cascade,
  mechanic_id              uuid not null references public.profiles (id),
  kind                     text not null check (kind in ('now', 'follow_on', 'reduction')),
  status                   text not null default 'sent'
                             check (status in ('draft', 'sent', 'approved', 'declined', 'withdrawn', 'expired')),
  title                    text,
  note                     text,
  hourly_rate_pence        integer not null,
  commission_rate          numeric(5,4) not null,
  labour_pence             integer not null default 0,
  parts_pence              integer not null default 0,
  total_pence              integer not null,
  platform_fee_pence       integer not null,
  mechanic_payout_pence    integer not null,
  stripe_payment_intent_id text,
  stripe_charge_id         text,
  sent_at                  timestamptz,
  responded_at             timestamptz,
  expires_at               timestamptz,
  captured_at              timestamptz,
  follow_on_booking_id     uuid references public.bookings (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check ((kind = 'reduction') = (total_pence < 0))
);
create index if not exists job_quotes_booking_idx on public.job_quotes (booking_id, created_at);
create index if not exists job_quotes_sent_idx on public.job_quotes (status) where status = 'sent';

create table if not exists public.booking_faults (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  mechanic_id uuid not null references public.profiles (id),
  description text not null check (char_length(description) between 1 and 500),
  severity    text not null default 'advisory' check (severity in ('advisory', 'urgent')),
  quote_id    uuid references public.job_quotes (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists booking_faults_booking_idx on public.booking_faults (booking_id, created_at);

create table if not exists public.job_quote_lines (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.job_quotes (id) on delete cascade,
  position    integer not null default 0,
  kind        text not null check (kind in ('labour', 'part', 'other')),
  description text not null,
  hours       numeric(5,2),
  quantity    integer not null default 1 check (quantity > 0),
  unit_pence  integer not null,
  line_pence  integer not null,
  node_id     text,
  part_id     uuid references public.parts (id) on delete set null,
  fault_id    uuid references public.booking_faults (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists job_quote_lines_quote_idx on public.job_quote_lines (quote_id, position);

-- Task 34: a booking made from a follow-on quote.
alter table public.bookings
  add column if not exists source_quote_id uuid references public.job_quotes (id) on delete set null;

-- RLS ------------------------------------------------------------------------
alter table public.job_quotes      enable row level security;
alter table public.job_quote_lines enable row level security;
alter table public.booking_faults  enable row level security;

drop policy if exists "Customers read own quotes" on public.job_quotes;
create policy "Customers read own quotes" on public.job_quotes
  for select using (
    exists (
      select 1 from public.bookings b
       where b.id = job_quotes.booking_id
         and (b.customer_id = auth.uid() or (b.customer_id is null and b.customer_email = auth.email()))
    )
  );
drop policy if exists "Mechanics read own quotes" on public.job_quotes;
create policy "Mechanics read own quotes" on public.job_quotes
  for select using (mechanic_id = auth.uid());
drop policy if exists "Admins read all quotes" on public.job_quotes;
create policy "Admins read all quotes" on public.job_quotes
  for select using (public.is_admin());

drop policy if exists "Customers read own quote lines" on public.job_quote_lines;
create policy "Customers read own quote lines" on public.job_quote_lines
  for select using (
    exists (
      select 1 from public.job_quotes q
      join public.bookings b on b.id = q.booking_id
       where q.id = job_quote_lines.quote_id
         and (b.customer_id = auth.uid() or (b.customer_id is null and b.customer_email = auth.email()))
    )
  );
drop policy if exists "Mechanics read own quote lines" on public.job_quote_lines;
create policy "Mechanics read own quote lines" on public.job_quote_lines
  for select using (
    exists (select 1 from public.job_quotes q where q.id = job_quote_lines.quote_id and q.mechanic_id = auth.uid())
  );
drop policy if exists "Admins read all quote lines" on public.job_quote_lines;
create policy "Admins read all quote lines" on public.job_quote_lines
  for select using (public.is_admin());

drop policy if exists "Customers read own booking faults" on public.booking_faults;
create policy "Customers read own booking faults" on public.booking_faults
  for select using (
    exists (
      select 1 from public.bookings b
       where b.id = booking_faults.booking_id
         and (b.customer_id = auth.uid() or (b.customer_id is null and b.customer_email = auth.email()))
    )
  );
drop policy if exists "Mechanics read assigned booking faults" on public.booking_faults;
create policy "Mechanics read assigned booking faults" on public.booking_faults
  for select using (
    exists (select 1 from public.bookings b where b.id = booking_faults.booking_id and b.mechanic_id = auth.uid())
  );
drop policy if exists "Admins read all booking faults" on public.booking_faults;
create policy "Admins read all booking faults" on public.booking_faults
  for select using (public.is_admin());

-- Realtime (config only; same guard as 0058).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'job_quotes'
  ) then
    alter publication supabase_realtime add table public.job_quotes;
  end if;
end $$;

-- Events: seven new types. The list is 0052's plus these; the drop/add
-- pattern is the one every CHECK change has used.
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
    'price_reduced'
  ));

comment on table public.job_quotes is
  'Quotes for extra work (Task 33): now = this visit (second Stripe hold, captured at completion); follow_on = a return visit (Task 34); reduction = the mechanic lowered the price (negative total, realised at capture).';
comment on table public.job_quote_lines is
  'A quote''s lines: labour (hours × platform rate, node_id when HaynesPro book time filled it in), part (catalogue or typed), other.';
comment on table public.booking_faults is
  'Faults the mechanic noted on the job (Task 33); a quote line can point back at one.';
