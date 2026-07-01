-- 0034_mechanic_balance_ledger.sql
-- Mechanic balance ledger — the source of truth for what a mechanic has earned,
-- been paid, and (via refund clawbacks) currently owes the platform.
--
-- WHY THIS EXISTS
-- ---------------
-- Mechanics are still paid INSTANTLY on job completion (owner decision
-- 2026-07-01) — Book My Tech does NOT hold their money on a schedule. But when
-- an admin refunds a customer, BMT fronts that cash out of its OWN Stripe
-- balance, and the value has to be recovered from the mechanic. Because the
-- mechanic was already paid for the original job, we can't reverse it — instead
-- their ledger balance goes NEGATIVE (a debt to BMT), and the debt is netted off
-- their next job's payout before the transfer goes out. Only the surplus is
-- transferred; the withheld part repays what BMT fronted.
--
-- MODEL (integer pence, signed):
--   balance = SUM(amount_pence)  -- what BMT owes the mechanic
--     'earning'         +payout      -- they earned their share on a completed job
--     'payout'          −transfer    -- cash actually transferred to them
--     'refund_clawback' −refund      -- admin refunded a customer; mechanic bears it
--     'adjustment'      ±manual      -- admin correction (reserved)
--
-- In steady state the balance sits at ~£0 (earn, then immediately pay out). It
-- only goes negative between a refund and its recovery on the next payout(s).
--
-- Mirrors the customer_credits ledger (0024): mechanic reads own, admin reads
-- all, every write goes through the service-role client (no browser INSERT).
--
-- Idempotent: safe to re-run.

create table if not exists public.mechanic_ledger (
  id                uuid primary key default gen_random_uuid(),
  mechanic_id       uuid not null references public.profiles(id) on delete cascade,
  -- Nullable: adjustments may not tie to a booking.
  booking_id        uuid references public.bookings(id) on delete set null,
  entry_type        text not null check (entry_type in (
                      'earning',
                      'payout',
                      'refund_clawback',
                      'adjustment'
                    )),
  -- Signed pence. + increases what BMT owes the mechanic, − decreases it.
  amount_pence      integer not null,
  description       text,
  -- Stripe references for reconciliation (informational).
  stripe_transfer_id text,
  stripe_refund_id   text,
  -- Admin actor for refund clawbacks / manual adjustments.
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists mechanic_ledger_mechanic_idx
  on public.mechanic_ledger (mechanic_id);

create index if not exists mechanic_ledger_mechanic_created_idx
  on public.mechanic_ledger (mechanic_id, created_at desc);

alter table public.mechanic_ledger enable row level security;

drop policy if exists "Mechanics read own ledger" on public.mechanic_ledger;
create policy "Mechanics read own ledger" on public.mechanic_ledger
  for select using (mechanic_id = auth.uid());

drop policy if exists "Admins read all ledger" on public.mechanic_ledger;
create policy "Admins read all ledger" on public.mechanic_ledger
  for select using (public.is_admin());

-- No browser INSERT/UPDATE/DELETE policy — earnings, payouts, and clawbacks are
-- all written by the service-role client (completeAndCharge + the admin refund
-- action), same privileged-write pattern as customer_credits and booking_events.
