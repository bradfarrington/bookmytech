-- 0020_funnel_events.sql
-- Task 10 Stage 1 — analytics dashboard.
--
-- Adds:
--   1. `funnel_events` — a lightweight, self-hosted event stream used to build
--      the booking conversion funnel on /admin/analytics. One row per tracked
--      step (reg lookup started → service selected → price viewed → slot picked
--      → booked & confirmed). Anonymous visitors are stitched together by a
--      `session_id` cookie; once a customer signs in we also stamp `user_id`.
--   2. Two SECURITY DEFINER aggregation RPCs the dashboard calls so the heavy
--      lifting (distinct-session funnel counts + a bucketed GMV/net series)
--      happens in Postgres, not by pulling raw rows into the server component.
--
-- Inserts are written by the trackEvent server action via the service-role
-- client (same privileged-write pattern as booking_events / job offers) — there
-- is deliberately NO public INSERT policy. Admins can read for the dashboard.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. funnel_events
-- ---------------------------------------------------------------------------
create table if not exists public.funnel_events (
  id          uuid primary key default gen_random_uuid(),
  -- Anonymous per-browser id from a first-party cookie (set by trackEvent).
  session_id  text not null,
  -- Nullable: set once the visitor is a signed-in customer.
  user_id     uuid references public.profiles(id),
  -- 'reg_lookup_started' | 'service_selected' | 'price_viewed'
  --   | 'slot_picked' | 'booking_confirmed'  (free-form; no CHECK so new
  --   funnel steps can be added without a migration).
  event_name  text not null,
  properties  jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists funnel_events_name_time_idx
  on public.funnel_events (event_name, occurred_at);
create index if not exists funnel_events_session_idx
  on public.funnel_events (session_id);

alter table public.funnel_events enable row level security;

drop policy if exists "Admins read funnel events" on public.funnel_events;
create policy "Admins read funnel events" on public.funnel_events
  for select using (public.is_admin());
-- No INSERT policy: rows are written server-side via the service-role client.

-- ---------------------------------------------------------------------------
-- 2a. analytics_funnel — distinct sessions that fired each funnel step within a
--     window. Returns every step (even zero-count ones) via a LEFT JOIN onto a
--     fixed ordered step list so the dashboard always renders five bars.
-- ---------------------------------------------------------------------------
create or replace function public.analytics_funnel(
  p_start timestamptz,
  p_end   timestamptz
)
returns table (event_name text, step_order int, sessions bigint)
language sql
security definer
set search_path = public
as $$
  with steps(event_name, step_order) as (
    values
      ('reg_lookup_started', 1),
      ('service_selected',   2),
      ('price_viewed',       3),
      ('slot_picked',        4),
      ('booking_confirmed',  5)
  )
  select
    s.event_name,
    s.step_order,
    coalesce(count(distinct fe.session_id), 0) as sessions
  from steps s
  left join public.funnel_events fe
    on fe.event_name = s.event_name
   and fe.occurred_at >= p_start
   and fe.occurred_at <  p_end
  group by s.event_name, s.step_order
  order by s.step_order;
$$;

-- ---------------------------------------------------------------------------
-- 2b. analytics_gmv_series — a bucketed time series of GMV, net revenue and
--     booking count over [p_start, p_end). Cancelled bookings are excluded from
--     GMV/net (they never transacted) but kept out of the count too. Bucket by
--     'day' or 'week' depending on the selected period (passed by the caller).
-- ---------------------------------------------------------------------------
create or replace function public.analytics_gmv_series(
  p_start       timestamptz,
  p_end         timestamptz,
  p_granularity text default 'day'
)
returns table (bucket timestamptz, gmv_pence bigint, net_pence bigint, bookings bigint)
language sql
security definer
set search_path = public
as $$
  select
    date_trunc(case when p_granularity = 'week' then 'week' else 'day' end, b.created_at) as bucket,
    coalesce(sum(b.total_pence), 0)        as gmv_pence,
    coalesce(sum(b.platform_fee_pence), 0) as net_pence,
    count(*)                                as bookings
  from public.bookings b
  where b.created_at >= p_start
    and b.created_at <  p_end
    and b.status <> 'cancelled'
  group by 1
  order by 1;
$$;

-- Admins (the only callers, from the server component under the admin session)
-- may execute the aggregations. SECURITY DEFINER means they read past RLS.
revoke all on function public.analytics_funnel(timestamptz, timestamptz) from public;
revoke all on function public.analytics_gmv_series(timestamptz, timestamptz, text) from public;
grant execute on function public.analytics_funnel(timestamptz, timestamptz) to authenticated;
grant execute on function public.analytics_gmv_series(timestamptz, timestamptz, text) to authenticated;
