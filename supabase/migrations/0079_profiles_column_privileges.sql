-- ---------------------------------------------------------------------------
-- 0079 — Stop a customer editing their own role (SECURITY FIX)
--
-- ⚠️ PRIVILEGE ESCALATION. Apply this before anything else in the queue.
--
-- `"Users can update own profile"` (0010) is
--
--     for update using (auth.uid() = id) with check (auth.uid() = id)
--
-- which is not column-restricted, and `authenticated` held a table-wide UPDATE
-- grant. So any signed-in customer could run one PostgREST call:
--
--     supabase.from('profiles').update({ role: 'admin' }).eq('id', <their id>)
--
-- and become a platform admin. Proved against the live project on 2026-09-16
-- with the seeded e2e customer: the update returned `[{"role":"admin"}]` and
-- the row really changed (restored immediately afterwards).
--
-- The anon key is public — it ships in every browser bundle and every app
-- build — so this was reachable by any customer with an account, not just by
-- someone with special access. `/admin/*` is gated on `profiles.role`
-- (proxy.ts) and `public.is_admin()` reads the same column, so the whole admin
-- surface hung on a column the customer could write.
--
-- 0076's header had already spotted the shape of this ("The 'Users can update
-- own profile' policy (0001) is not column-restricted, so a customer can write
-- any profiles column through PostgREST") and routed around it by putting the
-- Stripe Customer id in its own service-role table. That was the right call for
-- that column, but the underlying hole was never closed. This closes it.
--
-- TWO MECHANISMS, deliberately:
--
--  1. **Column privileges**, the same device `customer_vehicles` (0073) uses.
--     PostgREST refuses an update naming a column the role cannot write with
--     42501, BEFORE RLS is consulted. This is the real guard.
--  2. **A trigger backstop.** The grant is one line, and a future
--     `grant all on public.profiles to authenticated` — which Supabase's own
--     templates and a lot of copy-pasted SQL do freely — would silently
--     reopen it. The trigger restores privileged columns instead of raising,
--     so a careless re-grant fails closed rather than breaking writes.
--
-- What a customer may still change: their name, their phone, and their reminder
-- preferences. Those are the only columns any client writes under RLS —
-- `app/actions/customer-profile.ts` and `app/actions/mechanic-profile.ts` both
-- update `full_name` and `phone` on the USER's client, and the customer app
-- writes the same two directly. Everything else on the table is written by the
-- service role.
--
-- `avatar_url` is deliberately NOT granted: only the service role writes it
-- (mechanic uploads go through `app/actions/mechanic-profile.ts` with the admin
-- client), and a client-writable image URL is a content-injection surface for
-- nothing gained.
--
-- Privileged columns and why each one matters:
--   role          — platform admin access.
--   referral_code — someone else's code is how referral credit is attributed.
--   referred_by   — pointing at an arbitrary account claims a £10 credit.
--   deleted_at    — faking or undoing an account deletion.
--   id            — repointing a profile row at another auth user.
--   created_at    — audit order.
--
-- No app or website change is needed. Nothing legitimate writes these.
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

-- 1. Column privileges ------------------------------------------------------

revoke update on table public.profiles from authenticated;
revoke update on table public.profiles from anon;

grant update (
  full_name,
  phone,
  reminders_enabled,
  reminder_via_email,
  reminder_via_sms,
  reminder_via_push
) on table public.profiles to authenticated;

-- 2. Trigger backstop -------------------------------------------------------

create or replace function public.profiles_protect_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Only a customer/mechanic session is constrained. The service role, the
  -- table owner and migrations run as something else and must stay able to set
  -- a role (createMechanicAction, approvals, account deletion). An admin acting
  -- through the CRM is allowed too, though the CRM uses the service role
  -- anyway.
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    -- Restore rather than raise: this is a backstop, and a client that sends an
    -- unchanged value in a whole-row update should not start failing. The
    -- column grant above is what actually refuses an attempt.
    new.id            := old.id;
    new.role          := old.role;
    new.referral_code := old.referral_code;
    new.referred_by   := old.referred_by;
    new.deleted_at    := old.deleted_at;
    new.created_at    := old.created_at;
  end if;
  return new;
end;
$$;

comment on function public.profiles_protect_privileged_columns() is
  'Backstop for 0079: a customer session cannot change role, referral_code, referred_by, deleted_at, id or created_at even if the column UPDATE grant is widened again.';

drop trigger if exists profiles_protect_privileged_columns on public.profiles;
create trigger profiles_protect_privileged_columns
  before update on public.profiles
  for each row execute function public.profiles_protect_privileged_columns();
