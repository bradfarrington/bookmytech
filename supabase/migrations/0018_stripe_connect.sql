-- 0018_stripe_connect.sql
-- Task 08 Stage 3 — Stripe Connect Express for mechanic payouts.
--
-- Mechanics onboard with a Stripe-hosted Express flow; Stripe collects KYC,
-- bank details and identity. The connected account id + capability flags are
-- mirrored here from Stripe's account.updated webhook. A mechanic can't go
-- online (accept jobs) until payouts are enabled.
--
-- Idempotent: safe to re-run.

alter table public.mechanics
  add column if not exists stripe_account_id text;
alter table public.mechanics
  add column if not exists stripe_onboarding_complete boolean not null default false;
alter table public.mechanics
  add column if not exists stripe_charges_enabled boolean not null default false;
alter table public.mechanics
  add column if not exists stripe_payouts_enabled boolean not null default false;

-- Webhook handler looks mechanics up by their connected-account id.
create index if not exists mechanics_stripe_account_idx
  on public.mechanics (stripe_account_id)
  where stripe_account_id is not null;
