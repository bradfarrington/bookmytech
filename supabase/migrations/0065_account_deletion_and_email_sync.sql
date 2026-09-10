-- 0065_account_deletion_and_email_sync.sql
-- Task 39 — a customer deletes their account from the app (App Store guideline
-- 5.1.1(v)); a confirmed email change reaches the copies we keep in `public`.
--
-- ⚠️ SCHEMA CHANGE — the mobile app generates its TypeScript types from the
-- live schema, so `npm run db:types` must be re-run there after this applies.
-- `profiles.deleted_at` is a new nullable column the app reads under its own
-- RLS; `account_deletions` is service-role only and invisible to the app.
--
-- Four parts:
--
--  1. `profiles.deleted_at` — the account is anonymised IN PLACE, never
--     deleted. Completed bookings are financial records (HMRC: six years; the
--     mechanic payout ledger references them; reviews feed a public rating),
--     and `messages.sender_id`, `disputes.opened_by`, `dispute_messages`,
--     `funnel_events`, the resolution tables and every `reviewed_by` /
--     `updated_by` audit column reference `profiles(id)` with NO `on delete`
--     clause — a hard delete of anyone who ever sent a message would fail on
--     the constraint anyway. Keeping the row and its id means everything that
--     points at it resolves to a name that says what happened.
--
--  2. `account_deletions` — the audit row. There is no general admin audit
--     log (pricing_audit_log is pricing-only), and this is the one action a
--     customer can take that can't be reversed, so it gets its own table.
--
--  3. `delete_customer_account()` — the database half of deletion in ONE
--     transaction: anonymise the profile, scrub the contact details off the
--     bookings (keeping the rows), delete what is only theirs (push tokens,
--     unsent reminders, unspent credit), write the audit row. SECURITY
--     DEFINER, executable by service_role only; the route handler
--     (app/api/mobile/v1/account/delete) decides WHO and WHETHER, this
--     function only does the writes. See lib/account/delete-account.ts for the
--     full sequence (session revocation, confirmation email, the auth row).
--
--  4. A trigger on `auth.users` — `after update of email` — that rewrites
--     `bookings.customer_email` on the customer's bookings that are not yet
--     terminal, and `reminder_schedules.customer_email` on rows not yet sent.
--     The app changes email with `supabase.auth.updateUser({ email })` on the
--     client, deliberately: Supabase confirms by link (to both addresses with
--     Secure Email Change on), which the service-role path would skip — and
--     the email is the field that controls password resets. So the CRM is not
--     in the loop, and this trigger is how `public` finds out. Same shape as
--     `handle_new_user`. Completed bookings keep the address they were
--     invoiced to.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. profiles.deleted_at
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists deleted_at timestamptz;

comment on column public.profiles.deleted_at is
  'Set when the customer deleted their account (Task 39). The row is anonymised in place and kept: bookings, messages, reviews and disputes still reference it.';

-- ---------------------------------------------------------------------------
-- 2. account_deletions — audit
-- ---------------------------------------------------------------------------
create table if not exists public.account_deletions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id),
  -- 'mobile' today; the website when it grows the same button.
  source                 text not null,
  ip                     text,
  bookings_scrubbed      integer not null default 0,
  reminders_deleted      integer not null default 0,
  credits_deleted        integer not null default 0,
  push_tokens_deleted    integer not null default 0,
  created_at             timestamptz not null default now()
);

create index if not exists account_deletions_user_idx
  on public.account_deletions (user_id);

alter table public.account_deletions enable row level security;
-- No policies: service-role only. The app never reads this.

comment on table public.account_deletions is
  'One row per customer account deletion (Task 39). Service-role only.';

-- ---------------------------------------------------------------------------
-- 3. delete_customer_account() — the transactional half of deletion
-- ---------------------------------------------------------------------------
-- p_user_id        the customer (from the verified Bearer token — never a body)
-- p_email          their real address, so guest-era booking rows that were
--                  matched by email (customer_id null) are scrubbed too;
--                  otherwise a fresh sign-up on the freed address would see them
--                  through the `customer_email = auth.email()` policy arm.
-- p_sentinel_email the undeliverable address the auth row is about to take
--                  (deleted+<id>@invalid.bookmytech.co.uk); written onto the
--                  bookings so no real address stays on a deleted account's rows.
--
-- Returns the counts, which the caller writes into the audit row's twin in the
-- logs. Re-runnable: a retry after a failure later in the sequence just
-- re-applies the same values.
create or replace function public.delete_customer_account(
  p_user_id        uuid,
  p_email          text,
  p_sentinel_email text,
  p_source         text default 'mobile',
  p_ip             text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_rows       integer;
  v_bookings           integer;
  v_reminders          integer;
  v_credits            integer;
  v_push_tokens        integer;
begin
  -- Anonymise the profile in place. Role-gated so a staff row can never be
  -- anonymised through this path even if a caller got the id wrong.
  update public.profiles
     set full_name          = 'Deleted customer',
         phone              = null,
         avatar_url         = null,
         referral_code      = null,   -- unique; nulled so a scraped code stops minting credit
         referred_by        = null,
         reminders_enabled  = false,
         reminder_via_email = false,
         reminder_via_sms   = false,
         reminder_via_push  = false,
         deleted_at         = coalesce(deleted_at, now()),
         updated_at         = now()
   where id = p_user_id
     and role = 'customer';
  get diagnostics v_profile_rows = row_count;
  if v_profile_rows = 0 then
    raise exception 'delete_customer_account: % is not a customer profile', p_user_id
      using errcode = 'P0002';
  end if;

  -- Scrub the bookings but keep them: they are the invoice. customer_name and
  -- the address stay (the retention basis is the accounting record); the email
  -- and phone go. The email matters most — the customer-read policy has an
  -- email arm, and a real address left on a deleted account's row is the kind
  -- of thing that leaks the next time someone tidies up the nulls.
  update public.bookings
     set customer_email = p_sentinel_email,
         customer_phone = null,
         updated_at     = now()
   where customer_id = p_user_id
      or (customer_id is null
          and p_email is not null
          and lower(customer_email) = lower(p_email));
  get diagnostics v_bookings = row_count;

  -- What is only theirs.
  delete from public.customer_push_tokens where customer_id = p_user_id;
  get diagnostics v_push_tokens = row_count;

  delete from public.reminder_schedules
   where sent_at is null
     and (customer_id = p_user_id
          or (customer_id is null
              and p_email is not null
              and lower(customer_email) = lower(p_email)));
  get diagnostics v_reminders = row_count;

  -- Unspent credit goes; redemption rows stay — each is tied to a booking and
  -- is part of that booking's financial record.
  delete from public.customer_credits
   where customer_id = p_user_id
     and source <> 'redemption';
  get diagnostics v_credits = row_count;

  insert into public.account_deletions
    (user_id, source, ip, bookings_scrubbed, reminders_deleted, credits_deleted, push_tokens_deleted)
  values
    (p_user_id, p_source, p_ip, v_bookings, v_reminders, v_credits, v_push_tokens);

  return jsonb_build_object(
    'bookings_scrubbed',   v_bookings,
    'reminders_deleted',   v_reminders,
    'credits_deleted',     v_credits,
    'push_tokens_deleted', v_push_tokens
  );
end;
$$;

revoke all on function public.delete_customer_account(uuid, text, text, text, text) from public;
revoke all on function public.delete_customer_account(uuid, text, text, text, text) from anon, authenticated;
grant execute on function public.delete_customer_account(uuid, text, text, text, text) to service_role;

comment on function public.delete_customer_account(uuid, text, text, text, text) is
  'Task 39: anonymise a customer profile in place, scrub booking contact details, delete push tokens / unsent reminders / unspent credit, and write the audit row — one transaction. service_role only.';

-- ---------------------------------------------------------------------------
-- 3b. customer_admin_summary reads deleted_at
-- ---------------------------------------------------------------------------
-- Otherwise the admin list shows a customer called "Deleted customer" whose
-- email is the sentinel. Column appended at the end (CREATE OR REPLACE VIEW
-- only allows additions at the end). Grants unchanged: service_role only.
create or replace view public.customer_admin_summary as
select
  p.id,
  p.full_name,
  p.phone,
  p.referral_code,
  u.email,
  u.created_at        as joined_at,
  u.last_sign_in_at,
  coalesce(b.bookings_count, 0)    as bookings_count,
  coalesce(b.completed_count, 0)   as completed_count,
  coalesce(b.total_spent_pence, 0) as total_spent_pence,
  b.last_booking_at,
  coalesce(d.open_disputes, 0)     as open_disputes,
  p.deleted_at
from public.profiles p
join auth.users u on u.id = p.id
left join lateral (
  select
    count(*)                                        as bookings_count,
    count(*) filter (where bk.status = 'completed') as completed_count,
    coalesce(
      sum(bk.total_pence) filter (where bk.status = 'completed'), 0
    )                                               as total_spent_pence,
    max(bk.created_at)                              as last_booking_at
  from public.bookings bk
  where bk.customer_id = p.id
     or (bk.customer_id is null and lower(bk.customer_email) = lower(u.email))
) b on true
left join lateral (
  select count(*) as open_disputes
  from public.disputes ds
  join public.bookings bk on bk.id = ds.booking_id
  where ds.status in ('opened', 'responded', 'escalated')
    and (
      bk.customer_id = p.id
      or (bk.customer_id is null and lower(bk.customer_email) = lower(u.email))
    )
) d on true
where p.role = 'customer';

revoke all on public.customer_admin_summary from anon, authenticated;
grant select on public.customer_admin_summary to service_role;

-- ---------------------------------------------------------------------------
-- 4. Propagate a confirmed email change into public
-- ---------------------------------------------------------------------------
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or new.email is not distinct from old.email then
    return new;
  end if;

  -- Bookings not yet terminal: the confirmation, the day-before reminder and
  -- the receipt all read customer_email back off the row. Completed and
  -- cancelled bookings keep the address they were invoiced to.
  update public.bookings
     set customer_email = new.email,
         updated_at     = now()
   where customer_id = new.id
     and status not in ('completed', 'cancelled');

  -- Reminders not yet sent — by id, and by the old address for guest-era rows
  -- that were never stamped with an id.
  update public.reminder_schedules
     set customer_email = new.email
   where sent_at is null
     and (customer_id = new.id
          or (customer_id is null
              and old.email is not null
              and lower(customer_email) = lower(old.email)));

  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  execute function public.handle_user_email_change();

comment on function public.handle_user_email_change() is
  'Task 39: after auth.users.email changes (confirmed by Supabase), rewrite customer_email on non-terminal bookings and unsent reminders.';
