-- ---------------------------------------------------------------------------
-- 0083 — The mechanic app's Today extras: a daily goal, timed offline, and a
--        once-a-day ledger for the two "updates" pushes (Task 66)
--
-- 1. `mechanics.daily_goal_pence` — the mechanic's own earnings target for a
--    day, £10–£2,000. It is theirs: the app writes it directly with
--    supabase-js under "Mechanics can update own status" (0004), so it joins
--    the column UPDATE grant from 0081. Null = no goal set.
--
-- 2. `mechanics.resume_online_at` — when a timed "offline" ends. NOT writable
--    by the mechanic's session: it schedules a server-side job and only the
--    status route knows the allowed values (30 or 60 minutes, or the next
--    shift), so it is left out of the grant and the 0081 trigger restores it.
--    Only the service role sets it — lib/mechanics/availability.ts (the status
--    route) and /api/cron/resume-online. The app reads it off its own row.
--
--    The trigger also CLEARS it whenever a row's status becomes 'online' or
--    'on_job', whoever did it — the mechanic, the cron, or an admin setting a
--    status by hand (app/actions/mechanics.ts). One rule in one place, so no
--    path can leave a stale "back online at 14:30" on a mechanic who is
--    already online.
--
-- 3. `mechanic_daily_pushes` — "once per mechanic per day" for the evening
--    "Tomorrow at a glance" and the "End of day" recap. The primary key is the
--    lock: whoever inserts the row sends the push. Service-role only.
--
-- ⚠️ SCHEMA CHANGE: both apps regenerate their types (`npm run db:types`). Two
-- new nullable columns on `mechanics`, one new table neither app can read.
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

-- 1 + 2. Columns ------------------------------------------------------------

alter table public.mechanics
  add column if not exists daily_goal_pence integer,
  add column if not exists resume_online_at timestamptz;

alter table public.mechanics drop constraint if exists mechanics_daily_goal_pence_check;
alter table public.mechanics
  add constraint mechanics_daily_goal_pence_check
  check (daily_goal_pence between 1000 and 200000);

comment on column public.mechanics.daily_goal_pence is
  '0083: the mechanic''s own daily earnings target, in pence. Written by the mechanic app under RLS. Null = none set.';
comment on column public.mechanics.resume_online_at is
  '0083: when a timed offline ends and /api/cron/resume-online puts them back online. Service-role writes only; cleared by trigger whenever status becomes online or on_job.';

-- The cron's lookup: offline mechanics whose time is up.
create index if not exists mechanics_resume_online_idx
  on public.mechanics (resume_online_at) where resume_online_at is not null;

-- Column grants are additive: this adds the goal to 0081's list and nothing
-- else. `resume_online_at` is deliberately absent.
grant update (daily_goal_pence) on table public.mechanics to authenticated;

-- The 0081 trigger, with two additions: restore `resume_online_at` for a
-- mechanic's session, and clear it for everyone on online / on_job.
create or replace function public.mechanics_protect_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Only a mechanic's own session is constrained. The service role, the table
  -- owner and migrations run as something else, and an admin acting through the
  -- CRM may set a status by hand.
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    -- Backstop: restore rather than raise, so a client sending an unchanged
    -- value in a whole-row update does not start failing. The column grant
    -- above is what actually refuses an attempt.
    new.id                         := old.id;
    new.rating                     := old.rating;
    new.job_count                  := old.job_count;
    new.is_pro                     := old.is_pro;
    new.approved_at                := old.approved_at;
    new.created_at                 := old.created_at;
    new.stripe_account_id          := old.stripe_account_id;
    new.stripe_onboarding_complete := old.stripe_onboarding_complete;
    new.stripe_charges_enabled     := old.stripe_charges_enabled;
    new.stripe_payouts_enabled     := old.stripe_payouts_enabled;
    new.is_suspended               := old.is_suspended;
    new.suspended_until            := old.suspended_until;
    new.resume_online_at           := old.resume_online_at;

    -- The base postcode can be filled in, not moved.
    if coalesce(btrim(old.base_postcode), '') <> ''
       and new.base_postcode is distinct from old.base_postcode then
      raise exception 'Your base postcode can only be changed by Book My Tech. Contact support.'
        using errcode = 'P0001';
    end if;

    -- Availability. The same three rules as lib/mechanics/availability.ts,
    -- which answers them politely; this is for a client that skips it.
    if new.status is distinct from old.status then
      if new.status = 'on_job' or old.status = 'on_job' then
        raise exception 'You''re on a job. Finish it before changing your availability.'
          using errcode = 'P0001';
      end if;
      if new.status = 'online' then
        if not old.stripe_payouts_enabled then
          raise exception 'Connect your bank account before going online.'
            using errcode = 'P0001';
        end if;
        if old.is_suspended then
          raise exception 'Your account is suspended, so you can''t go online.'
            using errcode = 'P0001';
        end if;
      end if;
    end if;
  end if;

  -- Everyone, admins and the service role included: a mechanic who is online or
  -- on a job has nothing to come back from.
  if new.status in ('online', 'on_job') then
    new.resume_online_at := null;
  end if;

  return new;
end;
$$;

comment on function public.mechanics_protect_privileged_columns() is
  '0081/0083: a mechanic session cannot change rating, job_count, is_pro, approved_at, the stripe_* columns, its suspension or resume_online_at, cannot move a set base_postcode, and cannot go online without payouts or while suspended — even if the column UPDATE grant is widened again. Any update leaving status online or on_job clears resume_online_at.';

-- The trigger itself is unchanged from 0081; recreated so this file stands alone.
drop trigger if exists mechanics_protect_privileged_columns on public.mechanics;
create trigger mechanics_protect_privileged_columns
  before update on public.mechanics
  for each row execute function public.mechanics_protect_privileged_columns();

-- 3. Once-a-day pushes ------------------------------------------------------

create table if not exists public.mechanic_daily_pushes (
  mechanic_id uuid not null references public.mechanics(id) on delete cascade,
  day         date not null,                     -- the London day the push is ABOUT
  kind        text not null check (kind in ('tomorrow', 'recap')),
  sent_at     timestamptz not null default now(),
  primary key (mechanic_id, day, kind)
);

comment on table public.mechanic_daily_pushes is
  '0083: one row per "Tomorrow at a glance" / "End of day" push, so each goes once per mechanic per day. Service-role only; the insert is the lock.';

alter table public.mechanic_daily_pushes enable row level security;
revoke all on table public.mechanic_daily_pushes from anon, authenticated;
-- No policies: service-role only.
