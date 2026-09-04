-- 0055_booking_repairs.sql
-- Several HaynesPro repairs in one booking (Task 24, owner request
-- 2026-09-04: "choose an alternator, then add additional work … four or five
-- jobs in a trolley ready to book for a mechanic").
--
-- One row per job line. NO backfill: a booking with no rows here is a
-- single-repair booking (every booking before this task, and every one-job
-- booking after it) whose job lives, as it always did, in
-- bookings.repair_node_id / repair_description. Readers go through
-- lib/bookings/repair-lines.ts repairLinesFor(), which returns the rows or one
-- synthetic line, so there is one code path.
--
-- On a multi-job booking the booking row keeps repair_node_id = the first
-- line and repair_description = a summary ("Renew the alternator + 2 more
-- jobs"), so every list, CSV, email and text that shows one string keeps
-- working unchanged. service_duration_hours holds the billed hours for the
-- whole visit — each job's book time added up by default, or HaynesPro's
-- overlap-removed total when the admin setting says so — which the
-- arrival-window clash check reads.
--
-- Idempotent: safe to re-run.

create table if not exists public.booking_repairs (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references public.bookings(id) on delete cascade,
  position       smallint not null check (position >= 0),
  node_id        text not null,   -- HaynesPro repair-tree node id
  -- Snapshot of the HaynesPro description at booking time (same reasoning as
  -- booking_parts.part_name): the line renders without a HaynesPro call, and
  -- survives their quarterly renames.
  description    text not null,
  raw_hours      numeric(5,2) not null check (raw_hours >= 0),      -- the job's own book time
  charged_hours  numeric(5,2) not null check (charged_hours >= 0),  -- after overlap removal; 0 = covered by another job
  line_pence     integer not null check (line_pence >= 0),          -- charged_hours × rate; informational — lines need not sum to total_pence (1h minimum applies once)
  created_at     timestamptz not null default now(),
  unique (booking_id, node_id)
);

create index if not exists booking_repairs_booking_idx
  on public.booking_repairs (booking_id, position);

alter table public.booking_repairs enable row level security;

-- SELECT only. Rows are written by the service-role client in
-- lib/bookings/create-booking.ts alongside the booking; nothing else writes.

-- 1. The booking's customer — signed in, or a guest matched on email.
--    Mirrors "Customers can view own bookings" (0003) / booking_events (0005).
drop policy if exists "Customers read own booking repairs" on public.booking_repairs;
create policy "Customers read own booking repairs" on public.booking_repairs
  for select using (
    exists (
      select 1 from public.bookings b
       where b.id = booking_repairs.booking_id
         and (
           b.customer_id = auth.uid()
           or (b.customer_id is null and b.customer_email = auth.email())
         )
    )
  );

-- 2. The assigned mechanic (job detail). Mirrors 0008.
drop policy if exists "Mechanics read assigned booking repairs" on public.booking_repairs;
create policy "Mechanics read assigned booking repairs" on public.booking_repairs
  for select using (
    exists (
      select 1 from public.bookings b
       where b.id = booking_repairs.booking_id
         and b.mechanic_id = auth.uid()
    )
  );

-- 3. A mechanic holding a live offer. The offer screen lists every job BEFORE
--    anyone accepts (mechanic_id is still null then). Same shape as 0008's
--    "Mechanics can view offered bookings"; job_offers' own policies never
--    reference this table, so there is no recursion.
drop policy if exists "Mechanics read offered booking repairs" on public.booking_repairs;
create policy "Mechanics read offered booking repairs" on public.booking_repairs
  for select using (
    exists (
      select 1 from public.job_offers o
       where o.booking_id = booking_repairs.booking_id
         and o.mechanic_id = auth.uid()
    )
  );

-- 4. Admins read everything (pattern #1, docs/02-data-model.md).
drop policy if exists "Admins read all booking repairs" on public.booking_repairs;
create policy "Admins read all booking repairs" on public.booking_repairs
  for select using (public.is_admin());

-- How a multi-job booking's time was derived: 'sum' = each job's book time
-- added up (the default, platform_settings.repair_combine_mode), 'haynespro'
-- = the basket calculation with the overlap removed. Null on single-job and
-- pre-Task-24 rows.
alter table public.bookings add column if not exists combine_source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_combine_source_check'
  ) then
    alter table public.bookings
      add constraint bookings_combine_source_check
      check (combine_source is null or combine_source in ('haynespro', 'sum'));
  end if;
end $$;

comment on table public.booking_repairs is
  'Job lines of a multi-repair booking (Task 24). No rows = a single-repair booking; its job is on the bookings row.';
comment on column public.bookings.combine_source is
  'sum = each job''s book time added up (the default); haynespro = processRepairTasksV4 removed the overlap between jobs (admin setting repair_combine_mode); null = single job / pre-Task-24.';
