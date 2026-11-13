-- 0089_custom_quotes.sql
-- Task 75 — custom quotes from the admin dashboard.
--
-- ⚠️ SCHEMA CHANGE — the mobile apps generate their TypeScript types from the
-- live schema, so `npm run db:types` must be re-run in both after this
-- applies. The customer app may read its own custom_quotes rows directly
-- (policy below); everything else goes through /api/mobile/v1/custom-quotes.
--
-- A customer asks for a job the catalogue doesn't list (or the admin starts
-- one), the admin prices it as ONE total, and the customer gets an email with a
-- link. Approving goes straight into the normal booking funnel from the time
-- step: the same pre-auth hold, the same broadcast dispatch to every eligible
-- mechanic. Owner decisions (Brad, 2026-11-13): a customer "ask for a quote"
-- button; straight to booking; one total; everyone; open until either side
-- cancels (no expiry).
--
--   requested → sent → booked
--        │        ├──→ declined   (the customer)
--        └────────┴──→ withdrawn  (the admin)
--
-- The booking is priced from the quote's own snapshot (total, visit length,
-- hourly rate and commission at the time it was sent), never re-derived.
--
-- Additive: a new table, plus bookings.source_custom_quote_id, written only for
-- a booking made from a custom quote. Idempotent: safe to re-run.

create table if not exists public.custom_quotes (
  id                 uuid primary key default gen_random_uuid(),
  status             text not null default 'requested'
                       check (status in ('requested', 'sent', 'booked', 'declined', 'withdrawn')),
  -- Who asked: 'customer' through the site or app, 'admin' when started in the dashboard.
  source             text not null default 'customer' check (source in ('customer', 'admin')),
  customer_id        uuid references public.profiles (id) on delete set null,
  customer_name      text not null check (char_length(customer_name) between 1 and 120),
  customer_email     text not null check (char_length(customer_email) between 3 and 254),
  customer_phone     text check (customer_phone is null or char_length(customer_phone) <= 40),
  vehicle_reg        text not null check (char_length(vehicle_reg) between 1 and 16),
  vehicle_make       text check (vehicle_make is null or char_length(vehicle_make) <= 60),
  vehicle_model      text check (vehicle_model is null or char_length(vehicle_model) <= 80),
  postcode           text check (postcode is null or char_length(postcode) <= 10),
  -- What the customer asked for, in their words. Null when the admin started it.
  request_text       text check (request_text is null or char_length(request_text) <= 2000),
  -- What is quoted, as the customer and the mechanic read it.
  title              text check (title is null or char_length(title) <= 120),
  details            text check (details is null or char_length(details) <= 2000),
  total_pence        integer check (total_pence is null or total_pence > 0),
  visit_hours        numeric(4,2) not null default 1 check (visit_hours > 0 and visit_hours <= 24),
  -- Snapshot when sent: the booking's rate and commission come from here.
  hourly_rate_pence  integer,
  commission_rate    numeric(5,4),
  sent_at            timestamptz,
  responded_at       timestamptz,
  booking_id         uuid references public.bookings (id) on delete set null,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- A sent quote always has what the customer approves.
  check (status = 'requested' or status = 'withdrawn' or (title is not null and total_pence is not null))
);

create index if not exists custom_quotes_status_idx on public.custom_quotes (status, created_at desc);
create index if not exists custom_quotes_customer_idx on public.custom_quotes (customer_id);
create index if not exists custom_quotes_email_idx on public.custom_quotes (lower(customer_email));

comment on table public.custom_quotes is
  'Quotes the admin prices by hand for jobs the catalogue does not list (Task 75). One total; approving books it through the normal funnel.';

alter table public.custom_quotes enable row level security;

-- Writes are server-side only (service role). Reads: the admin, and a customer
-- their own once it is tied to their account.
drop policy if exists "Admins read all custom quotes" on public.custom_quotes;
create policy "Admins read all custom quotes" on public.custom_quotes
  for select using (public.is_admin());
drop policy if exists "Customers read own custom quotes" on public.custom_quotes;
create policy "Customers read own custom quotes" on public.custom_quotes
  for select using (customer_id = auth.uid());

alter table public.bookings
  add column if not exists source_custom_quote_id uuid references public.custom_quotes (id) on delete set null;

comment on column public.bookings.source_custom_quote_id is
  'The custom quote this booking was made from (Task 75); null otherwise.';

-- The customer account an email belongs to, so a quote raised for an email
-- (a guest's request, or one the admin typed) reaches that account: its
-- dashboard, its app and its push notifications. Customer accounts only.
-- Service role only: it reads auth.users.
create or replace function public.custom_quote_account_for_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id
    from auth.users u
    left join public.profiles p on p.id = u.id
   where lower(u.email) = lower(trim(p_email))
     and coalesce(p.role, 'customer') = 'customer'
   limit 1;
$$;
revoke all on function public.custom_quote_account_for_email(text) from public, anon, authenticated;
grant execute on function public.custom_quote_account_for_email(text) to service_role;
