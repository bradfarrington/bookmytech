-- 0011_job_media.sql
-- Web-based job evidence: mechanic-captured photos + a customer sign-off
-- signature, attached to a booking. Originally planned for the mobile PWA
-- (Task 06 Stage 4) but delivered on the responsive desktop view first.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- One row per uploaded artifact. kind = 'photo' (many per job) or 'signature'
-- (one sign-off per job — the completion gate checks one exists). storage_path
-- is the object key in the public 'job-media' bucket below.
-- ---------------------------------------------------------------------------
create table if not exists public.booking_media (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  mechanic_id  uuid not null references public.mechanics(id) on delete cascade,
  kind         text not null check (kind in ('photo', 'signature')),
  storage_path text not null,
  created_at   timestamptz not null default now()
);

create index if not exists booking_media_booking_idx
  on public.booking_media (booking_id);

alter table public.booking_media enable row level security;

-- Mechanic manages media for their own jobs; admins read all (pattern #2).
-- Writes actually go through the service-role client in the server action
-- (after verifying job ownership), so these policies mainly scope reads.
drop policy if exists "Mechanics manage own job media" on public.booking_media;
create policy "Mechanics manage own job media" on public.booking_media
  for all using (auth.uid() = mechanic_id) with check (auth.uid() = mechanic_id);

drop policy if exists "Admins can view all job media" on public.booking_media;
create policy "Admins can view all job media" on public.booking_media
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Public job-media bucket. Uploads go through the service-role client in the
-- server action (after verifying the owning mechanic), so no per-object write
-- policies are needed; public = true serves reads (object keys are unguessable
-- booking UUIDs, matching the 'avatars' precedent in 0010).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('job-media', 'job-media', true)
on conflict (id) do nothing;
