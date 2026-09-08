-- 0063_promo_codes.sql
-- Discount codes the admin can send out (Task 35, Gareth's change list
-- 2026-09-08): "on the main dashboard can we add a tab in for discounts that I
-- can send out and apply to customer bookings to honour their repeat custom,
-- like 10% off your next booking".
--
-- A code is a percentage or a fixed amount, with a window, a total redemption
-- cap, a per-customer cap and a minimum basket. It is applied at checkout,
-- BEFORE account credit, and it is BMT-funded exactly as credit is (owner
-- decision, Brad 2026-09-08): the customer pays less, the mechanic's payout is
-- untouched, and the platform's own fee absorbs it.
--
--   promo_codes        — the code itself.
--   promo_redemptions  — one row per use. 'reserved' while the customer is at
--                        the card step (keyed on the PaymentIntent, 1-hour
--                        TTL), 'redeemed' once the booking exists, 'released'
--                        when the hold was abandoned. Reserved-but-unexpired
--                        rows count toward the caps, so two people can't take
--                        the last redemption at once.
--   promo_code_sends   — who we sent a code to, and how.
--
-- The caps are enforced in ONE place: redeem_promo_code(), a SECURITY DEFINER
-- function that locks the code row before counting. Doing it in application
-- code would be a read-then-write race, and the thing being raced for is money.
--
-- Admin-only RLS on all three: customers never read the table — the checkout
-- resolves a typed code through the service-role client and answers with a
-- sentence, so an invalid code can't be told apart from a code for someone else.
--
-- Idempotent: safe to re-run.

create table if not exists public.promo_codes (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique
                       check (code = upper(code) and code ~ '^[A-Z0-9-]{3,24}$'),
  kind               text not null check (kind in ('percent', 'fixed')),
  -- percent: 1–100. fixed: pence.
  value              integer not null check (value > 0),
  description        text,
  starts_at          timestamptz not null default now(),
  expires_at         timestamptz,
  -- null = unlimited.
  max_redemptions    integer check (max_redemptions is null or max_redemptions > 0),
  per_customer_limit integer not null default 1 check (per_customer_limit > 0),
  min_total_pence    integer not null default 0 check (min_total_pence >= 0),
  is_active          boolean not null default true,
  created_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100)
);

create table if not exists public.promo_redemptions (
  id                       uuid primary key default gen_random_uuid(),
  code_id                  uuid not null references public.promo_codes (id) on delete cascade,
  customer_id              uuid not null references public.profiles (id) on delete cascade,
  booking_id               uuid references public.bookings (id) on delete set null,
  stripe_payment_intent_id text,
  discount_pence           integer not null check (discount_pence >= 0),
  status                   text not null default 'reserved'
                             check (status in ('reserved', 'redeemed', 'released')),
  -- Reservation TTL; ignored once redeemed.
  expires_at               timestamptz,
  created_at               timestamptz not null default now()
);
create index if not exists promo_redemptions_code_idx on public.promo_redemptions (code_id, customer_id);
create unique index if not exists promo_redemptions_booking_key
  on public.promo_redemptions (code_id, booking_id) where booking_id is not null;
create unique index if not exists promo_redemptions_intent_key
  on public.promo_redemptions (stripe_payment_intent_id) where stripe_payment_intent_id is not null;

create table if not exists public.promo_code_sends (
  id          uuid primary key default gen_random_uuid(),
  code_id     uuid not null references public.promo_codes (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  channel     text not null check (channel in ('email', 'sms')),
  sent_by     uuid references public.profiles (id),
  sent_at     timestamptz not null default now(),
  error       text
);
create index if not exists promo_code_sends_code_idx on public.promo_code_sends (code_id, sent_at);

alter table public.bookings
  add column if not exists discount_pence integer not null default 0,
  add column if not exists promo_code text;
comment on column public.bookings.discount_pence is
  'Promo-code discount applied at checkout (Task 35). BMT-funded: the mechanic''s payout is unaffected. charge = total − discount − credit.';

-- RLS: admin only. Everything customer-facing goes through the service-role
-- client in lib/promos/*.
alter table public.promo_codes       enable row level security;
alter table public.promo_redemptions enable row level security;
alter table public.promo_code_sends  enable row level security;

drop policy if exists "Admins manage promo codes" on public.promo_codes;
create policy "Admins manage promo codes" on public.promo_codes
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admins read promo redemptions" on public.promo_redemptions;
create policy "Admins read promo redemptions" on public.promo_redemptions
  for select using (public.is_admin());
drop policy if exists "Admins read promo sends" on public.promo_code_sends;
create policy "Admins read promo sends" on public.promo_code_sends
  for select using (public.is_admin());

-- The one place the caps are enforced. Locks the code row, counts live
-- redemptions (redeemed, or reserved and unexpired), then inserts. Raises with
-- a code the caller maps to a customer-facing sentence.
create or replace function public.redeem_promo_code(
  p_code_id           uuid,
  p_customer_id       uuid,
  p_discount_pence    integer,
  p_payment_intent_id text,
  p_booking_id        uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code   public.promo_codes;
  v_live   integer;
  v_mine   integer;
  v_id     uuid;
begin
  select * into v_code from public.promo_codes where id = p_code_id for update;
  if not found then raise exception 'promo_not_found'; end if;
  if not v_code.is_active then raise exception 'promo_inactive'; end if;
  if v_code.starts_at > now() then raise exception 'promo_not_started'; end if;
  if v_code.expires_at is not null and v_code.expires_at <= now() then raise exception 'promo_expired'; end if;

  select count(*) into v_live
    from public.promo_redemptions r
   where r.code_id = p_code_id
     and (r.status = 'redeemed' or (r.status = 'reserved' and r.expires_at > now()));
  if v_code.max_redemptions is not null and v_live >= v_code.max_redemptions then
    raise exception 'promo_used_up';
  end if;

  select count(*) into v_mine
    from public.promo_redemptions r
   where r.code_id = p_code_id
     and r.customer_id = p_customer_id
     and (r.status = 'redeemed' or (r.status = 'reserved' and r.expires_at > now()));
  if v_mine >= v_code.per_customer_limit then
    raise exception 'promo_already_used';
  end if;

  insert into public.promo_redemptions
    (code_id, customer_id, booking_id, stripe_payment_intent_id, discount_pence, status, expires_at)
  values (
    p_code_id, p_customer_id, p_booking_id, p_payment_intent_id, p_discount_pence,
    case when p_booking_id is null then 'reserved' else 'redeemed' end,
    case when p_booking_id is null then now() + interval '1 hour' else null end
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.redeem_promo_code(uuid, uuid, integer, text, uuid) from public, anon, authenticated;

comment on table public.promo_codes is
  'Discount codes the admin creates and sends out (Task 35). Applied before account credit; BMT-funded, so the mechanic''s payout is unaffected.';
comment on function public.redeem_promo_code is
  'Reserve (booking null) or redeem a promo code under a row lock — the single enforcement point for max_redemptions and per_customer_limit.';
