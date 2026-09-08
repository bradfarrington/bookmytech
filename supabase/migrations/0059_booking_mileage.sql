-- Task 30 — the mechanic records the vehicle's mileage on the job.
--
-- Gareth (2026-09-08): "Add a mileage box for mechanics." Nothing captured
-- mileage before — DVLA VES and the DVSA MOT lookup as wired here don't
-- return it — so this is the first place an odometer reading lands. The
-- mechanic types it on the job page while they're with the car (any time
-- from acceptance until completion); it is shown to the customer, the admin
-- and on the receipt email, and Task 32 makes it REQUIRED before a servicing
-- or inspection job can be completed (a service record needs the odometer).
--
-- Miles, whole number. NULL = not recorded (every booking before this task,
-- and any repair the mechanic didn't fill it in on). Additive; the mobile app
-- reads `bookings` raw and simply gains an optional column.
--
-- Idempotent: safe to re-run.
alter table public.bookings
  add column if not exists mileage integer;

alter table public.bookings
  drop constraint if exists bookings_mileage_range;
alter table public.bookings
  add constraint bookings_mileage_range
  check (mileage is null or (mileage >= 0 and mileage <= 1500000));

comment on column public.bookings.mileage is
  'Odometer reading in miles, typed by the mechanic on the job (Task 30). NULL = not recorded.';
