-- 0024_referrals_and_credits.sql
-- Task 11 Stage 3 — customer referrals + account credits.
--
-- Adds:
--   1. profiles.referral_code / referred_by — every customer gets a unique
--      shareable code; referred_by records who brought them in.
--   2. customer_credits — a money LEDGER (positive grants, negative redemptions).
--      Balance = sum of unexpired rows. £10 referral rewards + redemptions at
--      checkout live here. Customer reads own; admin reads all; service-role writes.
--   3. bookings credit columns:
--      - credit_applied_pence: how much account credit reduced the held amount.
--      - payment_mode: 'preauth' (default — the full remaining amount is held at
--        booking, captured on completion) or 'free' (account credit covered the
--        whole total, so there is genuinely nothing to authorise — no card).
--
-- NOTE: the pre-authorisation hold is ALWAYS taken at booking (owner decision
-- 2026-06-05) — there is no "trusted customer skips the hold" path. Credit only
-- ever reduces the amount held; 'free' is solely the credit-covers-everything edge.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Referral fields on profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists referral_code text,
  add column if not exists referred_by   uuid references public.profiles(id);

-- Backfill codes for existing customers (deterministic from id — negligible
-- collision risk in the BMT###### space; the unique index below guards anyway).
update public.profiles
   set referral_code = 'BMT' || upper(substr(md5(id::text), 1, 6))
 where referral_code is null;

create unique index if not exists profiles_referral_code_key
  on public.profiles (referral_code);

-- ---------------------------------------------------------------------------
-- 2. customer_credits — ledger
-- ---------------------------------------------------------------------------
create table if not exists public.customer_credits (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references public.profiles(id) on delete cascade,
  -- Positive = grant, negative = redemption/adjustment. Always integer pence.
  amount_pence        integer not null,
  source              text not null check (source in (
                        'referral_welcome', -- referee's £10 off their first booking
                        'referral_bonus',   -- referrer's £10 after referee completes
                        'compensation',
                        'promo',
                        'redemption'         -- negative — applied at checkout
                      )),
  description         text,
  expires_at          timestamptz,
  redeemed_at         timestamptz,
  redeemed_booking_id uuid references public.bookings(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index if not exists customer_credits_customer_idx
  on public.customer_credits (customer_id);

alter table public.customer_credits enable row level security;

drop policy if exists "Customers read own credits" on public.customer_credits;
create policy "Customers read own credits" on public.customer_credits
  for select using (customer_id = auth.uid());

drop policy if exists "Admins read all credits" on public.customer_credits;
create policy "Admins read all credits" on public.customer_credits
  for select using (public.is_admin());

-- No browser INSERT/UPDATE policy — grants + redemptions go through the
-- service-role client in the signup action, completeAndCharge, and checkout.

-- ---------------------------------------------------------------------------
-- 3. bookings — credit columns
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists credit_applied_pence integer not null default 0,
  add column if not exists payment_mode         text not null default 'preauth'
    check (payment_mode in ('preauth', 'free'));
