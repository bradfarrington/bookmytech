-- ---------------------------------------------------------------------------
-- 0077 — Account deletion covers the new dashboard data (Tasks 49 to 53)
--
-- delete_customer_account() (0065) deletes what is the customer's alone. The
-- dashboard added three more such things, so it deletes them too, in the same
-- transaction:
--   • customer_addresses   (0072)
--   • customer_vehicles    (0073)
--   • customer_inbox_reads (0075)
--
-- Saved cards are NOT deleted here. They live at Stripe, and the Stripe Customer
-- has to be deleted through Stripe's API, which a database function can't call.
-- lib/account/delete-account.ts deletes the Stripe Customer (which removes its
-- cards) and then the `stripe_customers` row, before this function runs. If
-- Stripe fails, the row is kept and the id logged, so it can be retried.
--
-- The audit row gains three counts. Same signature, so the caller is unchanged;
-- the returned object gains three keys.
--
-- ⚠️ SCHEMA CHANGE (three columns on account_deletions, service-role only): the
-- customer app regenerates its types (`npm run db:types`).
-- Apply after 0072, 0073 and 0075. Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

alter table public.account_deletions
  add column if not exists addresses_deleted   integer not null default 0,
  add column if not exists vehicles_deleted    integer not null default 0,
  add column if not exists inbox_reads_deleted integer not null default 0;

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
  v_addresses          integer;
  v_vehicles           integer;
  v_inbox_reads        integer;
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
  -- and phone go.
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

  -- Unspent credit goes; redemption rows stay (each is part of a booking's
  -- financial record).
  delete from public.customer_credits
   where customer_id = p_user_id
     and source <> 'redemption';
  get diagnostics v_credits = row_count;

  -- Task 49 to 52: the dashboard's own data.
  delete from public.customer_addresses where customer_id = p_user_id;
  get diagnostics v_addresses = row_count;

  delete from public.customer_vehicles where customer_id = p_user_id;
  get diagnostics v_vehicles = row_count;

  delete from public.customer_inbox_reads where customer_id = p_user_id;
  get diagnostics v_inbox_reads = row_count;

  insert into public.account_deletions
    (user_id, source, ip, bookings_scrubbed, reminders_deleted, credits_deleted, push_tokens_deleted,
     addresses_deleted, vehicles_deleted, inbox_reads_deleted)
  values
    (p_user_id, p_source, p_ip, v_bookings, v_reminders, v_credits, v_push_tokens,
     v_addresses, v_vehicles, v_inbox_reads);

  return jsonb_build_object(
    'bookings_scrubbed',   v_bookings,
    'reminders_deleted',   v_reminders,
    'credits_deleted',     v_credits,
    'push_tokens_deleted', v_push_tokens,
    'addresses_deleted',   v_addresses,
    'vehicles_deleted',    v_vehicles,
    'inbox_reads_deleted', v_inbox_reads
  );
end;
$$;

revoke all on function public.delete_customer_account(uuid, text, text, text, text) from public;
revoke all on function public.delete_customer_account(uuid, text, text, text, text) from anon, authenticated;
grant execute on function public.delete_customer_account(uuid, text, text, text, text) to service_role;

comment on function public.delete_customer_account(uuid, text, text, text, text) is
  'Task 39, extended by Task 49 to 53 (0077): anonymise a customer profile in place, scrub booking contact details, delete push tokens / unsent reminders / unspent credit / saved addresses / garage / inbox state, and write the audit row. One transaction. service_role only.';
