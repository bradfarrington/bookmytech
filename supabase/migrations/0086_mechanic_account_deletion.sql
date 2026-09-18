-- 0086_mechanic_account_deletion.sql
-- Task 70 — a MECHANIC deletes their account from the mechanic app (App Store
-- guideline 5.1.1(v)). The twin of `delete_customer_account()` (0065) for a
-- shape that function knows nothing about.
--
-- ⚠️ SCHEMA CHANGE — both apps generate their TypeScript types from the live
-- schema, so `npm run db:types` must be re-run in BOTH app repos after this
-- applies. Nothing is renamed or dropped: two new nullable columns on
-- `account_deletions` (service-role only, invisible to both apps) and one new
-- function. Old builds are unaffected.
--
-- WHY A SECOND FUNCTION rather than widening the first. `delete_customer_account`
-- is role-gated to `role = 'customer'` and raises otherwise, which is right: it
-- scrubs booking contact details and deletes customer credit, reminders and
-- customer push tokens, and knows nothing about an earnings ledger, live job
-- offers, documents in a private bucket, availability, a location fix or the
-- `mechanics` row dispatch reads. Two functions, each honest about what it
-- deletes, beats one with a branch in the middle.
--
-- WHAT IS KEPT, and why:
--   • the `profiles` row — anonymised in place. `reviews.mechanic_id`,
--     `mechanic_ledger.mechanic_id`, `messages.sender_id`, `disputes.opened_by`,
--     `resolution_cases.mechanic_id`, `booking_events.actor_id` and every
--     `reviewed_by` / `resolved_by` audit column reference it with no
--     `on delete` clause. A hard delete would fail on the constraint anyway.
--   • the `mechanics` row — `bookings.mechanic_id` references it. It is put
--     OFFLINE and permanently suspended instead, which is the pair of gates
--     lib/dispatch/dispatch.ts reads, so it can never be offered another job.
--   • completed bookings, the ledger and the reviews — financial and public
--     records. The reviews keep the rating they gave; the mechanic's name on
--     them becomes "Deleted mechanic".
--
-- WHAT GOES: the identifying and operational rows that are theirs alone —
-- document rows (their files are deleted from the bucket first, by the caller),
-- availability, the last location fix, push tokens, inbox read state, the
-- once-a-day push ledger, and any still-live job offer (superseded, not deleted:
-- `job_offers` is the dispatch audit trail).
--
-- The caller (lib/account/delete-mechanic-account.ts) decides WHO and WHETHER —
-- the blockers, the sign-out, the email, the bucket and the auth row are all its
-- job. This function only does the writes, in one transaction.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. account_deletions carries mechanics too
-- ---------------------------------------------------------------------------
-- The existing count columns are customer-shaped (bookings_scrubbed,
-- reminders_deleted, credits_deleted). Rather than add five more that are null
-- for every customer row, a mechanic deletion records its counts as jsonb and
-- says which kind of account it was.
alter table public.account_deletions
  add column if not exists account_role text not null default 'customer',
  add column if not exists details      jsonb;

comment on column public.account_deletions.account_role is
  '0086: which kind of account was deleted — customer (0065) or mechanic (Task 70).';
comment on column public.account_deletions.details is
  '0086: per-role deletion counts that do not fit the customer-shaped columns.';

-- ---------------------------------------------------------------------------
-- 2. delete_mechanic_account()
-- ---------------------------------------------------------------------------
-- p_user_id        the mechanic (from the verified Bearer token — never a body)
-- p_sentinel_email the undeliverable address the auth row is about to take
--                  (deleted+<id>@invalid.bookmytech.co.uk). Unlike the customer
--                  function there is nothing to write it onto — a mechanic's
--                  address is never copied onto a booking — so it is recorded in
--                  `details` and nowhere else, which is what makes a retry
--                  verifiable.
--
-- Returns the counts. Re-runnable: a retry after a failure later in the sequence
-- just re-applies the same values.
create or replace function public.delete_mechanic_account(
  p_user_id        uuid,
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
  v_profile_rows   integer;
  v_documents      integer;
  v_availability   integer;
  v_locations      integer;
  v_push_tokens    integer;
  v_offers         integer;
  v_inbox_reads    integer;
  v_daily_pushes   integer;
begin
  -- Must actually be a mechanic. The `mechanics` row is what grants mechanic
  -- access (not profiles.role — an admin who works jobs keeps role='admin'),
  -- so that is what is checked. The caller refuses an admin separately.
  if not exists (select 1 from public.mechanics where id = p_user_id) then
    raise exception 'delete_mechanic_account: % has no mechanics row', p_user_id
      using errcode = 'P0002';
  end if;

  -- Anonymise the profile in place. Role-gated so an admin row can never be
  -- anonymised through this path even if a caller got the id wrong.
  update public.profiles
     set full_name          = 'Deleted mechanic',
         phone              = null,
         avatar_url         = null,
         referral_code      = null,
         referred_by        = null,
         reminders_enabled  = false,
         reminder_via_email = false,
         reminder_via_sms   = false,
         reminder_via_push  = false,
         deleted_at         = coalesce(deleted_at, now()),
         updated_at         = now()
   where id = p_user_id
     and role = 'mechanic';
  get diagnostics v_profile_rows = row_count;
  if v_profile_rows = 0 then
    raise exception 'delete_mechanic_account: % is not a mechanic profile', p_user_id
      using errcode = 'P0002';
  end if;

  -- Off the road for good. `status = 'offline'` and `is_suspended` are the two
  -- gates lib/dispatch/dispatch.ts reads; `suspended_until = null` means it
  -- never lifts. The bio and specialisms go because they are their words and
  -- their trade, shown on a public profile page (0074).
  update public.mechanics
     set status               = 'offline',
         is_suspended         = true,
         suspended_until      = null,
         resume_online_at     = null,
         bio                  = null,
         specialisms          = '{}',
         base_postcode        = null,
         daily_goal_pence     = null,
         updated_at           = now()
   where id = p_user_id;

  -- Their documents' ROWS. The files themselves are removed from the private
  -- bucket by the caller before this runs — storage is not transactional, so it
  -- cannot be part of this.
  delete from public.mechanic_documents where mechanic_id = p_user_id;
  get diagnostics v_documents = row_count;

  delete from public.mechanic_availability where mechanic_id = p_user_id;
  get diagnostics v_availability = row_count;

  delete from public.mechanic_locations where mechanic_id = p_user_id;
  get diagnostics v_locations = row_count;

  delete from public.mechanic_push_tokens where mechanic_id = p_user_id;
  get diagnostics v_push_tokens = row_count;

  delete from public.mechanic_inbox_reads where mechanic_id = p_user_id;
  get diagnostics v_inbox_reads = row_count;

  delete from public.mechanic_daily_pushes where mechanic_id = p_user_id;
  get diagnostics v_daily_pushes = row_count;

  -- Any still-live offer is closed, not deleted: `job_offers` is the dispatch
  -- audit trail for the booking, and the customer's job still needs to show who
  -- it was offered to. 'superseded' is what a sibling offer takes when someone
  -- else wins it, which is the closest true thing here.
  update public.job_offers
     set response = 'superseded',
         responded_at = now()
   where mechanic_id = p_user_id
     and response is null;
  get diagnostics v_offers = row_count;

  -- Their application, if they came through the public form: it holds a home
  -- postcode, references' names and contact details, and AES-GCM bank details.
  -- The row is the record that they were vetted, so it stays; what identifies
  -- them and what could pay them goes.
  update public.mechanic_applications
     set email                         = p_sentinel_email,
         full_name                     = 'Deleted mechanic',
         phone                         = '',
         bank_sort_code_encrypted      = null,
         bank_account_number_encrypted = null,
         reference_1_name = null, reference_1_email = null,
         reference_1_phone = null, reference_1_relationship = null,
         reference_2_name = null, reference_2_email = null,
         reference_2_phone = null, reference_2_relationship = null,
         resubmit_token                = null,
         updated_at                    = now()
   where lower(email) = lower(
           (select coalesce(u.email, '') from auth.users u where u.id = p_user_id)
         )
      or approved_mechanic_id = p_user_id;

  insert into public.account_deletions
    (user_id, source, ip, account_role, details)
  values
    (p_user_id, p_source, p_ip, 'mechanic', jsonb_build_object(
      'documents_deleted',     v_documents,
      'availability_deleted',  v_availability,
      'locations_deleted',     v_locations,
      'push_tokens_deleted',   v_push_tokens,
      'offers_superseded',     v_offers,
      'inbox_reads_deleted',   v_inbox_reads,
      'daily_pushes_deleted',  v_daily_pushes,
      'sentinel_email',        p_sentinel_email
    ));

  return jsonb_build_object(
    'documents_deleted',    v_documents,
    'availability_deleted', v_availability,
    'locations_deleted',    v_locations,
    'push_tokens_deleted',  v_push_tokens,
    'offers_superseded',    v_offers,
    'inbox_reads_deleted',  v_inbox_reads,
    'daily_pushes_deleted', v_daily_pushes
  );
end;
$$;

revoke all on function public.delete_mechanic_account(uuid, text, text, text) from public;
revoke all on function public.delete_mechanic_account(uuid, text, text, text) from anon, authenticated;
grant execute on function public.delete_mechanic_account(uuid, text, text, text) to service_role;

comment on function public.delete_mechanic_account(uuid, text, text, text) is
  'Task 70: anonymise a mechanic profile in place, take the mechanics row permanently offline, delete documents / availability / location / push tokens / inbox reads / daily pushes, supersede live offers, scrub their application, and write the audit row — one transaction. service_role only.';
