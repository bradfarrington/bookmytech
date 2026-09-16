-- ---------------------------------------------------------------------------
-- 0078 — Pending email changes (Task 58)
--
-- Changing the account email is the last flow where a customer saw Supabase's
-- own screens and emails: the browser called `auth.updateUser({ email })`, so
-- GoTrue sent its default "Confirm Email Change" mail and its links went
-- through <project>.supabase.co/auth/v1/verify. Brad's note on Task 55 was that
-- every screen, email and link a customer sees should be ours.
--
-- WHY OUR OWN TOKEN RATHER THAN generateLink()
--
-- With Secure Email Change on, GoTrue needs BOTH addresses to confirm, which
-- means two tokens. `admin.generateLink()` returns one token per call and
-- REGENERATES the pair on every call — verified against the live project on
-- 2026-09-16: after calling it for `email_change_current`, the token returned by
-- the earlier `email_change_new` call failed with `otp_expired`. So the two
-- links GoTrue's own mailer sends cannot both be obtained through the admin API.
-- Password reset can use generateLink because it needs exactly one token; this
-- can't.
--
-- So the pending change lives here instead, and `admin.updateUserById()` applies
-- it once confirmed. What protects the account is not weaker than before, and on
-- one count stronger:
--   • the current password is checked before anything is sent (GoTrue's flow
--     never asked for it — the browser session was enough);
--   • the NEW address must open a link, proving it is reachable and theirs;
--   • the CURRENT address is told, with a "wasn't me" route, so a change can't
--     happen quietly behind someone who still reads their old inbox.
--
-- The token is never stored. Only its sha256 is, so a leaked copy of this table
-- cannot be used to move anyone's account — the same reasoning as a password
-- hash. It is single-use (`confirmed_at`) and expires in 24 hours.
--
-- SERVICE-ROLE ONLY. RLS is enabled with NO policies, so neither client can read
-- or write it, and a customer cannot list their own token hashes. The website
-- reaches it through lib/account/email-change.ts and the customer app through
-- POST /api/mobile/v1/account/email.
--
-- delete_customer_account() needs no change: the FK cascades from profiles.
--
-- ⚠️ SCHEMA CHANGE (new table, service-role only): the customer app regenerates
-- its types (`npm run db:types`). It never reads this table.
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

create table if not exists public.pending_email_changes (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.profiles(id) on delete cascade,
  -- Already lowercased and shape-checked by the caller; stored as sent.
  new_email    text not null,
  -- sha256 of the opaque token, hex. The token itself only ever exists in the
  -- email we send.
  token_hash   text not null unique,
  -- Whoever asked, for looking into an unexpected change. Nullable: not every
  -- request arrives with a forwarded-for header.
  requested_ip text,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  -- Set when redeemed. Non-null means spent, so a link works exactly once.
  confirmed_at timestamptz,

  constraint pending_email_changes_new_email_shape
    check (new_email = lower(new_email) and new_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint pending_email_changes_expires_after_created
    check (expires_at > created_at)
);

-- One live request per account. Asking again supersedes the last one, which the
-- caller does by deleting its unconfirmed rows first; this index is the backstop
-- that stops two concurrent requests both standing.
create unique index if not exists pending_email_changes_one_live_per_customer
  on public.pending_email_changes (customer_id)
  where confirmed_at is null;

-- The redemption lookup.
create index if not exists pending_email_changes_token_hash_idx
  on public.pending_email_changes (token_hash);

comment on table public.pending_email_changes is
  'Email changes awaiting confirmation by the new address (Task 58). Service-role only: RLS on, no policies. Tokens are stored as sha256 and are single-use.';

-- Service-role only. RLS on with no policies denies every anon and authenticated
-- request, which is the whole point: a customer has no reason to read a token
-- hash, and the app never touches this table.
alter table public.pending_email_changes enable row level security;
