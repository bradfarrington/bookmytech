-- 0015_mechanic_documents.sql
-- Task 07 Stage 3 — documents management for active mechanics.
--
-- Once approved, mechanics keep their insurance / qualification / ID up to
-- date here. Replacement uploads enter 'pending_review' for an admin to
-- approve. An expiry sweep (app/api/cron/document-expiry) emails reminders and
-- auto-sets a mechanic offline once a required document expires.
--
-- Files reuse the existing private 'mechanic-docs' bucket (0013), under
-- documents/{mechanic_id}/...; reads go through service-role signed URLs.
--
-- Idempotent: safe to re-run.

create table if not exists public.mechanic_documents (
  id           uuid primary key default gen_random_uuid(),
  mechanic_id  uuid not null references public.mechanics(id) on delete cascade,
  doc_type     text not null
    check (doc_type in ('public_liability_insurance', 'trade_insurance', 'qualification', 'id', 'vat')),
  file_url     text not null, -- object key in the private 'mechanic-docs' bucket
  expires_at   date,
  status       text not null default 'pending_review'
    check (status in ('pending_review', 'verified', 'rejected', 'expired')),
  uploaded_at  timestamptz not null default now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists mechanic_documents_mechanic_idx
  on public.mechanic_documents (mechanic_id);
create index if not exists mechanic_documents_expiry_idx
  on public.mechanic_documents (expires_at)
  where status = 'verified';

drop trigger if exists touch_mechanic_documents on public.mechanic_documents;
create trigger touch_mechanic_documents
  before update on public.mechanic_documents
  for each row execute function public.touch_updated_at();

alter table public.mechanic_documents enable row level security;

-- Mechanic reads + uploads their own documents; admins read/manage all.
-- (pattern #1 for the admin check; mechanic predicate is self-scoped.)
drop policy if exists "Mechanics view own documents" on public.mechanic_documents;
create policy "Mechanics view own documents" on public.mechanic_documents
  for select using (auth.uid() = mechanic_id);

drop policy if exists "Mechanics insert own documents" on public.mechanic_documents;
create policy "Mechanics insert own documents" on public.mechanic_documents
  for insert with check (auth.uid() = mechanic_id);

drop policy if exists "Admins view all documents" on public.mechanic_documents;
create policy "Admins view all documents" on public.mechanic_documents
  for select using (public.is_admin());

drop policy if exists "Admins update documents" on public.mechanic_documents;
create policy "Admins update documents" on public.mechanic_documents
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins delete documents" on public.mechanic_documents;
create policy "Admins delete documents" on public.mechanic_documents
  for delete using (public.is_admin());
