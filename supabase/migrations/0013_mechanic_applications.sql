-- 0013_mechanic_applications.sql
-- Task 07 Stage 1 — public mechanic application flow.
--
-- Adds the `mechanic_applications` table that backs the /mechanics/apply wizard
-- and the /admin/approvals queue, plus a PRIVATE `mechanic-docs` storage bucket
-- for the uploaded ID / insurance / qualification / VAT documents.
--
-- Unlike the public `avatars` / `job-media` buckets (0010 / 0011), these
-- documents are sensitive PII and must only be readable by the applicant and
-- admins — so the bucket is private and the admin UI serves them through
-- short-lived signed URLs (see app/actions/approvals.ts). Bank details are NOT
-- stored as files: they're AES-256-GCM encrypted at the application level
-- (lib/crypto/encrypt.ts) and held in the *_encrypted text columns below.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- Applications. One row per prospective mechanic. The row is inserted only on
-- final submit (status='submitted') via the service-role client — applicants
-- are guests with no auth session, so there is deliberately no public INSERT
-- policy. Documents are uploaded to the private bucket under a draft UUID
-- before submit and their object keys land in the doc_* columns here.
-- ---------------------------------------------------------------------------
create table if not exists public.mechanic_applications (
  id uuid primary key default gen_random_uuid(),

  -- Step 1 — about you
  email             text not null unique,
  full_name         text not null,
  phone             text not null,
  postcode          text not null,
  years_experience  integer,

  -- Step 2 — your business
  business_type   text check (business_type in ('sole_trader', 'limited_company')),
  business_name   text,
  business_number text, -- UTR or company number
  vat_registered  boolean not null default false,

  -- Step 3 — specialisms + service area
  specialisms          text[] not null default '{}',
  service_radius_miles integer not null default 10 check (service_radius_miles between 1 and 100),

  -- Step 4 — documents (object keys in the private 'mechanic-docs' bucket)
  doc_photo_id                     text,
  doc_public_liability_insurance   text,
  doc_trade_insurance              text,
  doc_qualification                text,
  doc_vat                          text,

  -- Bank details — AES-256-GCM ciphertext, never plain text (see lib/crypto)
  bank_sort_code_encrypted      text,
  bank_account_number_encrypted text,

  -- References
  reference_1_name text, reference_1_email text, reference_1_phone text, reference_1_relationship text,
  reference_2_name text, reference_2_email text, reference_2_phone text, reference_2_relationship text,

  -- Status
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'approved', 'approved_with_grace', 'rejected', 'needs_info')),
  -- approved_with_grace = admin override: mechanic is live but has 28 days to
  -- supply outstanding docs. grace_period_ends_at is set when that status is used.
  grace_period_ends_at timestamptz,
  rejection_reason     text,
  -- needs_info: a note explaining what's outstanding + a token for the public
  -- resubmit link emailed to the applicant.
  needs_info_note text,
  resubmit_token  uuid,

  submitted_at timestamptz not null default now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid references public.profiles(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mechanic_applications_status_idx
  on public.mechanic_applications (status, submitted_at);
create unique index if not exists mechanic_applications_resubmit_token_idx
  on public.mechanic_applications (resubmit_token)
  where resubmit_token is not null;

-- updated_at maintenance (reuses the shared trigger fn from 0004).
drop trigger if exists touch_mechanic_applications on public.mechanic_applications;
create trigger touch_mechanic_applications
  before update on public.mechanic_applications
  for each row execute function public.touch_updated_at();

alter table public.mechanic_applications enable row level security;

-- Admin-only table. Applicant-facing reads/writes go through the service-role
-- client in server actions (guests have no session), so the only RLS policies
-- needed are the admin ones. There is intentionally no public SELECT — these
-- rows hold PII (contact details, business numbers, references).
drop policy if exists "Admins can view all applications" on public.mechanic_applications;
create policy "Admins can view all applications" on public.mechanic_applications
  for select using (public.is_admin());

drop policy if exists "Admins can update applications" on public.mechanic_applications;
create policy "Admins can update applications" on public.mechanic_applications
  for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Private documents bucket. public = false: objects are NOT served without
-- auth. Uploads go through the service-role client in submit-application.ts
-- (after the applicant has filled the form); admins view via 1-hour signed
-- URLs minted in approvals.ts. No per-object storage policies are needed
-- because every read/write is service-role.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('mechanic-docs', 'mechanic-docs', false)
on conflict (id) do nothing;
