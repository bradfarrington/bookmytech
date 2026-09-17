-- ---------------------------------------------------------------------------
-- 0081 — The mechanic app's rate limits, and stop a mechanic editing their own
--        rating, Pro status, suspension and Stripe flags (SECURITY FIX)
--
-- 1. Rate limits for the mechanic app's endpoints, seeded like 0076. Code
--    defaults in lib/rate-limit/limiter.ts are identical, so the endpoints are
--    limited even before this runs.
--      mechanic  POST /api/mobile/v1/mechanic/stripe/onboarding, …/stripe/refresh
--                (a Stripe call each) and …/mechanic/status (a redispatch).
--
-- 2. The same hole 0079 closed on `profiles`, on `mechanics`.
--
--    "Mechanics can update own status" (0004) is
--
--        for update using (auth.uid() = id) with check (auth.uid() = id)
--
--    which restricts WHICH ROW and says nothing about which columns, and
--    `authenticated` holds a table-wide UPDATE grant. So a mechanic — with the
--    public anon key and their own session, from the website or either app —
--    can run:
--
--        supabase.from('mechanics').update({ rating: 5, is_pro: true })
--        supabase.from('mechanics').update({ is_suspended: false })
--        supabase.from('mechanics').update({ stripe_payouts_enabled: true })
--        supabase.from('mechanics').update({ stripe_account_id: 'acct_<theirs>' })
--        supabase.from('mechanics').update({ status: 'online' })
--
--    i.e. fake their public rating and Pro badge, lift their own suspension,
--    skip the payouts gate, or repoint their payouts. 0007's header even notes
--    that the policy "gates on the row id, not the column set".
--
--    TWO MECHANISMS, as in 0079:
--
--     a. **Column privileges.** PostgREST refuses an update naming a column the
--        role cannot write with 42501, before RLS is consulted.
--     b. **A trigger**, which does two jobs here. It is the backstop against a
--        careless `grant all … to authenticated` (restoring privileged columns
--        rather than raising, so that fails closed). And it enforces what a
--        grant cannot express — rules about VALUES:
--          · `status` may not become 'online' without payouts, or while
--            suspended, and a mechanic may not set 'on_job' at all;
--          · `base_postcode` may be filled in once but not moved afterwards —
--            it decides which jobs are in range.
--        These two raise rather than restore: silently keeping someone offline
--        while answering 200 would be a lie the client then renders.
--
--    What a mechanic's session may still write — everything any client writes
--    under RLS today, and nothing else:
--      status, online_at, last_seen_at   the availability toggle
--                                        (lib/mechanics/availability.ts)
--      bio, service_radius_miles,        the profile / setup screens
--      specialisms                       (app/actions/mechanic-profile.ts, and
--                                        the mechanic app directly)
--      base_postcode                     the mechanic app's setup wizard, only
--                                        while it is empty
--
--    `status` has to stay granted for a second reason: an ADMIN's session is
--    also the `authenticated` role, and `setMechanicStatusAction`
--    (app/actions/mechanics.ts) writes it through the admin's own client.
--    Column grants cannot tell an admin from a mechanic; the trigger can, and
--    leaves admins alone. Every other privileged column is written by the
--    service role only (Stripe webhook, review aggregates, suspensions,
--    provisioning), which bypasses both mechanisms.
--
--    `updated_at` is not granted and does not need to be: no client names it,
--    and `mechanics_touch_updated_at` sets it from inside a trigger, which
--    column privileges do not apply to.
--
-- No app or website change is needed. Nothing legitimate writes these columns
-- from a mechanic's session.
-- ⚠️ SCHEMA CHANGE: both apps regenerate their types (`npm run db:types`). No
-- column changed; one function is added.
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

-- 1. Rate limits ------------------------------------------------------------

insert into public.platform_settings (key, value) values
  ('mobile_mechanic_user_burst', '15'::jsonb),   -- per user, per 60s
  ('mobile_mechanic_user_daily', '300'::jsonb),  -- per user, per 24h
  ('mobile_mechanic_ip_burst',   '30'::jsonb),   -- per IP,   per 60s
  ('mobile_mechanic_ip_daily',   '800'::jsonb)   -- per IP,   per 24h
on conflict (key) do nothing;

-- 2a. Column privileges -----------------------------------------------------

revoke update on table public.mechanics from authenticated;
revoke update on table public.mechanics from anon;

grant update (
  status,
  online_at,
  last_seen_at,
  bio,
  service_radius_miles,
  specialisms,
  base_postcode
) on table public.mechanics to authenticated;

-- 2b. Trigger ---------------------------------------------------------------

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
  return new;
end;
$$;

comment on function public.mechanics_protect_privileged_columns() is
  '0081: a mechanic session cannot change rating, job_count, is_pro, approved_at, the stripe_* columns or its suspension, cannot move a set base_postcode, and cannot go online without payouts or while suspended — even if the column UPDATE grant is widened again.';

drop trigger if exists mechanics_protect_privileged_columns on public.mechanics;
create trigger mechanics_protect_privileged_columns
  before update on public.mechanics
  for each row execute function public.mechanics_protect_privileged_columns();
