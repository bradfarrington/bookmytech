-- 0035_booking_job_numbers.sql
-- Sequential, human-facing job numbers on bookings.
--
-- WHY THIS EXISTS
-- ---------------
-- Every "job reference" shown to customers, mechanics and admins was previously
-- derived on the fly from the booking's UUID primary key (the first 8 hex chars,
-- uppercased). To a customer that reads as a random string. The owner wants a
-- proper sequential number — 00001, 00002, 00003, … — that grows over time as
-- jobs come in, so a job can be quoted and looked up like a normal reference.
--
-- MODEL
-- -----
-- A dedicated bigint column `job_number` on bookings, drawn from a Postgres
-- sequence so numbering is gapless-per-insert and monotonically increasing.
-- Existing rows are backfilled in creation order (oldest = 00001). Display
-- padding ("00001") is a presentation concern handled in the app
-- (formatJobNumber in lib/utils.ts); the DB stores the raw integer.

-- 1. The sequence that hands out the next number.
create sequence if not exists public.bookings_job_number_seq;

-- 2. The column (nullable for now so the backfill can populate it).
alter table public.bookings
  add column if not exists job_number bigint;

-- 3. Backfill existing rows in the order they were created, so the earliest
--    booking becomes #1. Ties on created_at are broken by id for determinism.
with ordered as (
  select id, row_number() over (order by created_at asc, id asc) as rn
  from public.bookings
  where job_number is null
)
update public.bookings b
  set job_number = ordered.rn
  from ordered
  where b.id = ordered.id;

-- 4. Advance the sequence past the highest number we just assigned so the next
--    insert continues the run (setval with is_called=true → nextval = max + 1).
select setval(
  'public.bookings_job_number_seq',
  coalesce((select max(job_number) from public.bookings), 0)
);

-- 5. New bookings draw the next number automatically, and tie the sequence's
--    lifecycle to the column.
alter table public.bookings
  alter column job_number set default nextval('public.bookings_job_number_seq');
alter sequence public.bookings_job_number_seq owned by public.bookings.job_number;

-- 6. Enforce uniqueness (also a fast lookup path for "find job #42").
create unique index if not exists bookings_job_number_key
  on public.bookings(job_number);
