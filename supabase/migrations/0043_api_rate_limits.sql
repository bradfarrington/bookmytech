-- 0043_api_rate_limits.sql
-- Task 18 Stage 1 — rate limiting for the public mobile endpoints.
--
-- WHY POSTGRES AND NOT REDIS
-- Upstash Redis is the better-shaped tool for this: counters with TTLs are what
-- it exists for, and it would keep this traffic off the primary database. We
-- picked Postgres anyway, on three grounds:
--   1. No new vendor, account, billing relationship or secret to rotate. We
--      already have Supabase and a service-role client; this is one table and
--      one function inside infrastructure we already operate and back up.
--   2. The volume doesn't justify it. This guards a handful of endpoints on a
--      pre-launch app — a single indexed upsert per request, on a table that
--      never exceeds (active callers × buckets) rows.
--   3. Correctness is easier to prove here. The counter is one atomic
--      INSERT … ON CONFLICT DO UPDATE, so concurrent requests across serverless
--      instances can't race. That is exactly the failure the in-memory cache in
--      lookupVehicleAction already has.
-- Revisit if the lookup endpoint ever gets hot enough that this write shows up
-- in database load; the limiter interface (lib/rate-limit/limiter.ts) is small
-- and swapping the store behind it is a contained change.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- api_rate_limits — fixed-window counters.
--
-- One row per (bucket, subject, window). `bucket` is the thing being limited
-- ('mobile_lookup_ip_burst'), `subject` is who ('ip:1.2.3.4', 'user:<uuid>',
-- 'global'). Fixed rather than sliding windows: a sliding window needs either a
-- row per request or a sorted set, and fixed windows are accurate enough to stop
-- a caller burning our DVLA credits.
-- ---------------------------------------------------------------------------
create table if not exists public.api_rate_limits (
  bucket       text        not null,
  subject      text        not null,
  window_start timestamptz not null,
  expires_at   timestamptz not null,
  count        integer     not null default 0,
  primary key (bucket, subject, window_start)
);

create index if not exists api_rate_limits_expires_idx
  on public.api_rate_limits (expires_at);

-- Service-role only. RLS is on with NO policies, so anon and authenticated can
-- reach nothing here even though the table lives in the public schema — a
-- customer must never be able to read (or reset) their own counter.
alter table public.api_rate_limits enable row level security;

revoke all on table public.api_rate_limits from anon, authenticated;

-- ---------------------------------------------------------------------------
-- consume_rate_limit — count this request and say whether it is allowed.
--
-- Returns the post-increment count, so a caller that is already over the limit
-- keeps being counted (and stays blocked for the rest of the window) rather than
-- getting a free retry every time.
-- ---------------------------------------------------------------------------
create or replace function public.consume_rate_limit(
  p_bucket         text,
  p_subject        text,
  p_window_seconds integer,
  p_limit          integer
)
returns table (allowed boolean, used integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_reset_at     timestamptz;
  v_used         integer;
begin
  -- Align every caller in the same window onto one row, so the counter is a
  -- single atomic upsert with no read-modify-write race between instances.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  v_reset_at := v_window_start + make_interval(secs => p_window_seconds);

  insert into public.api_rate_limits as l (bucket, subject, window_start, expires_at, count)
  values (p_bucket, p_subject, v_window_start, v_reset_at, 1)
  on conflict (bucket, subject, window_start)
  do update set count = l.count + 1
  returning l.count into v_used;

  -- Opportunistic sweep — roughly 1 request in 200 clears rows whose window
  -- closed over an hour ago. Cheaper and less to forget than a cron entry, and
  -- the table is tiny between sweeps.
  if random() < 0.005 then
    delete from public.api_rate_limits where expires_at < now() - interval '1 hour';
  end if;

  return query select (v_used <= p_limit), v_used, v_reset_at;
end;
$$;

revoke all on function public.consume_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- Limits live in platform_settings so they are tunable in the database with no
-- redeploy (same mechanism as hourly_rate_pence). lib/rate-limit/limiter.ts
-- falls back to identical defaults in code, so the endpoint is still limited if
-- this seed hasn't been applied.
--
-- /vehicle/lookup is unauthenticated and bills us per miss (DVLA VES + DVSA
-- MOT), hence three layers: burst stops hammering, daily caps one caller's
-- spend, global caps the blast radius of a distributed attack.
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value) values
  ('mobile_lookup_ip_burst',     '10'::jsonb),    -- per IP,  per 60s
  ('mobile_lookup_ip_daily',     '200'::jsonb),   -- per IP,  per 24h
  ('mobile_lookup_user_burst',   '6'::jsonb),     -- per user, per 60s
  ('mobile_lookup_user_daily',   '50'::jsonb),    -- per user, per 24h
  ('mobile_lookup_global_daily', '5000'::jsonb),  -- everyone, per 24h — the spend ceiling
  ('mobile_signup_ip_burst',     '5'::jsonb),     -- per IP,  per 60s
  ('mobile_signup_ip_daily',     '20'::jsonb)     -- per IP,  per 24h
on conflict (key) do nothing;
