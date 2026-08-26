-- 0050_customer_push_tokens.sql
-- Push notifications for the customer mobile app (Task 19 / P1).
--
-- ⚠️ SCHEMA CHANGE — two new tables and a new column on `profiles`. The mobile
-- app regenerates its types from the live schema (`npm run db:types` there).
--
-- Until now a customer heard from us by email and SMS only; `profiles` has
-- carried `reminder_via_email` / `reminder_via_sms` since 0023 with a comment
-- deferring push to "the native app". This is that. Push runs ALONGSIDE SMS,
-- not instead of it (app plan, decision 2) — every send site in the code fires
-- both, best-effort.
--
-- ---------------------------------------------------------------------------
-- 1. customer_push_tokens — one row per device, keyed on the Expo push token.
-- ---------------------------------------------------------------------------
--
-- The TOKEN is the key, not (customer_id, token), on purpose. A phone that
-- changes hands re-registers the same token under the new customer, and the
-- upsert then MOVES the row to them — rather than leaving the previous owner's
-- row in place and the new owner receiving somebody else's booking updates.
--
-- Service-role writes only, through POST /api/mobile/v1/devices and
-- /devices/remove. RLS is ON with NO policies: the app never reads this table,
-- and a token is an address that must not be readable by anyone but us.
create table if not exists public.customer_push_tokens (
  token        text primary key,                 -- "ExponentPushToken[…]"
  customer_id  uuid not null references public.profiles(id) on delete cascade,
  platform     text not null check (platform in ('ios', 'android')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists customer_push_tokens_customer_idx
  on public.customer_push_tokens (customer_id);

alter table public.customer_push_tokens enable row level security;

-- ---------------------------------------------------------------------------
-- 2. push_receipts — tickets awaiting a delivery receipt.
-- ---------------------------------------------------------------------------
--
-- Expo answers a send with a TICKET straight away and a RECEIPT some minutes
-- later, and it is the receipt that can say `DeviceNotRegistered` — the app was
-- uninstalled, or notifications were revoked. Expo's docs are explicit that a
-- project which keeps sending to dead tokens gets throttled, so every ticket
-- id is parked here and `/api/cron/push-receipts` collects the receipts and
-- deletes any token they condemn. Rows are removed once checked, or after 24h
-- (Expo keeps receipts about that long).
--
-- Service-role only; RLS on, no policies.
create table if not exists public.push_receipts (
  ticket_id  text primary key,
  token      text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_receipts_created_idx
  on public.push_receipts (created_at);

alter table public.push_receipts enable row level security;

-- ---------------------------------------------------------------------------
-- 3. profiles.reminder_via_push — the switch the reminder sender honours,
--    alongside the email and SMS ones. Default ON: a customer who granted the
--    OS permission has already said yes, and until they register a device the
--    flag does nothing.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists reminder_via_push boolean not null default true;
