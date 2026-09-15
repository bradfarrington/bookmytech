-- ---------------------------------------------------------------------------
-- 0076 — Saved cards (Task 53), and rate limits for the new account and slot
-- endpoints (Tasks 50, 53, 54)
--
-- 1. `stripe_customers` — which Stripe Customer holds a profile's saved cards.
--
--    NOT a column on `profiles`, deliberately. The "Users can update own
--    profile" policy (0001) is not column-restricted, so a customer can write
--    any profiles column through PostgREST. A `profiles.stripe_customer_id`
--    would let someone point their account at another customer's Stripe
--    Customer, then list or pay with that person's cards. This table has RLS
--    on and no policies: only the server reads or writes it, and no client ever
--    needs the id (the endpoints return cards, not customers).
--
--    Keyed by (profile, livemode) so switching the deployment between test and
--    live keys never hands a test-mode id to the live API.
--
-- 2. Rate limits, seeded like 0047. Code defaults in lib/rate-limit/limiter.ts
--    are identical, so the endpoints are limited even before this runs.
--      account  POST /api/mobile/v1/garage, the payment-methods endpoints
--               (list, add, remove, default). Each spends a DVLA lookup or a
--               Stripe API call.
--      slots    GET /api/mobile/v1/slots. Guest-accessible; each call geocodes
--               a postcode and reads every mechanic's calendar.
--
-- ⚠️ SCHEMA CHANGE: the customer app regenerates its types (`npm run db:types`).
-- The table is not readable by the app; it will simply appear in the types.
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

create table if not exists public.stripe_customers (
  profile_id         uuid not null references public.profiles(id) on delete cascade,
  livemode           boolean not null,
  stripe_customer_id text not null unique,
  created_at         timestamptz not null default now(),
  primary key (profile_id, livemode)
);

comment on table public.stripe_customers is
  'The Stripe Customer holding a profile''s saved cards, per Stripe mode (Task 53). Service-role only: never a profiles column, because customers can write profiles.';

alter table public.stripe_customers enable row level security;
revoke all on table public.stripe_customers from anon, authenticated;
-- No policies: service-role only.

insert into public.platform_settings (key, value) values
  ('mobile_account_user_burst', '15'::jsonb),    -- per user, per 60s
  ('mobile_account_user_daily', '120'::jsonb),   -- per user, per 24h
  ('mobile_account_ip_burst',   '30'::jsonb),    -- per IP,   per 60s
  ('mobile_account_ip_daily',   '400'::jsonb),   -- per IP,   per 24h
  ('mobile_slots_user_burst',   '30'::jsonb),    -- per user, per 60s
  ('mobile_slots_user_daily',   '400'::jsonb),   -- per user, per 24h
  ('mobile_slots_ip_burst',     '40'::jsonb),    -- per IP,   per 60s
  ('mobile_slots_ip_daily',     '800'::jsonb)    -- per IP,   per 24h
on conflict (key) do nothing;
