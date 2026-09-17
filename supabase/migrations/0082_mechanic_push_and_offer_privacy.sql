-- ---------------------------------------------------------------------------
-- 0082 — Push for the mechanic app, its feed rate limits, and stop a lost or
--        declined offer being a permanent window onto the customer (Task 65)
--
-- 1. `mechanic_push_tokens` — the mechanic app's devices. A mirror of
--    `customer_push_tokens` (0050), and a separate table on purpose: the two
--    apps are separate Expo projects, a phone with both installed holds a
--    different token for each, and `sendPushToCustomer` must not be able to
--    reach a mechanic app (or the reverse) whatever ids line up. An admin who
--    also works jobs is one profile in both tables, with different tokens.
--
--    The TOKEN is the key, so a phone that changes hands moves to the new
--    mechanic. Service-role writes only, through
--    POST /api/mobile/v1/mechanic/devices and /devices/remove. RLS ON with NO
--    policies: no client reads this table.
--
--    `push_receipts` (0050) is shared — a receipt is about a token, not an app.
--
-- 2. Rate limits for the mechanic app's polled reads, seeded like 0081. Code
--    defaults in lib/rate-limit/limiter.ts are identical.
--      mechanicfeed  GET /api/mobile/v1/mechanic/offers and
--                    …/mechanic/bookings/[id]/arrival-windows
--
-- 3. PRIVACY FIX. "Mechanics can view offered bookings" (0008) and "Mechanics
--    read offered booking repairs" (0055) test only that a `job_offers` row
--    EXISTS for the mechanic — not that it is still live. Offers are never
--    deleted. So every mechanic a job was ever broadcast to — the ones who
--    declined, and the ones who lost the race — keeps a read of that
--    `bookings` row for good: the customer's name, phone, email and street
--    address, for a job that went to somebody else.
--
--    Both policies now require `response is null`. Nothing legitimate relied on
--    the old reach: the feeds list live offers only, the mechanic who ACCEPTED
--    reads the job through "Mechanics can view assigned bookings" instead, and
--    the website's offer page now checks the offer before it looks at the
--    booking, so an answered offer still says "no longer available".
--
--    This narrows the window; it does not close it. A mechanic holding a LIVE
--    offer can still read the whole row, because RLS is row-level. The mechanic
--    app does not use that read — it gets a summary without the customer's
--    details from GET /mechanic/offers — but the website's offer page does.
--    Closing it fully means serving that page from the server too and dropping
--    the policy; left for its own task.
--
-- ⚠️ SCHEMA CHANGE: both apps regenerate their types (`npm run db:types`). One
-- new table, not readable by either app.
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

-- 1. mechanic_push_tokens ---------------------------------------------------

create table if not exists public.mechanic_push_tokens (
  token        text primary key,                 -- "ExponentPushToken[…]"
  mechanic_id  uuid not null references public.mechanics(id) on delete cascade,
  platform     text not null check (platform in ('ios', 'android')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists mechanic_push_tokens_mechanic_idx
  on public.mechanic_push_tokens (mechanic_id);

comment on table public.mechanic_push_tokens is
  'Expo push tokens for the MECHANIC app (Task 65). Service-role only. Separate from customer_push_tokens so a notification for one app can never reach the other.';

alter table public.mechanic_push_tokens enable row level security;
revoke all on table public.mechanic_push_tokens from anon, authenticated;
-- No policies: service-role only.

-- 2. Rate limits ------------------------------------------------------------

insert into public.platform_settings (key, value) values
  ('mobile_mechanicfeed_user_burst', '40'::jsonb),     -- per user, per 60s
  ('mobile_mechanicfeed_user_daily', '8000'::jsonb),   -- per user, per 24h
  ('mobile_mechanicfeed_ip_burst',   '80'::jsonb),     -- per IP,   per 60s
  ('mobile_mechanicfeed_ip_daily',   '24000'::jsonb)   -- per IP,   per 24h
on conflict (key) do nothing;

-- 3. Offered-booking reads end when the offer does --------------------------

drop policy if exists "Mechanics can view offered bookings" on public.bookings;
create policy "Mechanics can view offered bookings" on public.bookings
  for select using (
    exists (
      select 1 from public.job_offers o
      where o.booking_id = bookings.id
        and o.mechanic_id = auth.uid()
        and o.response is null
    )
  );

drop policy if exists "Mechanics read offered booking repairs" on public.booking_repairs;
create policy "Mechanics read offered booking repairs" on public.booking_repairs
  for select using (
    exists (
      select 1 from public.job_offers o
       where o.booking_id = booking_repairs.booking_id
         and o.mechanic_id = auth.uid()
         and o.response is null
    )
  );
