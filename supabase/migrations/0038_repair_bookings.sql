-- 0038_repair_bookings.sql
-- Bookable HaynesPro repairs (Task 16 Stage G, owner request 2026-07-10).
--
-- Alongside the packaged services, customers can now browse the HaynesPro
-- repair-times tree for THEIR car on /book/service (Repairs tab) and book a
-- single repair operation. The price comes from that operation's OEM book
-- time: billed whole hours (round up, min 1h) × the global hourly rate.
--
-- Idempotent: safe to re-run.

-- Snapshot which repair was booked. Every job surface prefers
-- repair_description over the joined service name when it's set.
alter table public.bookings
  add column if not exists repair_node_id text;
alter table public.bookings
  add column if not exists repair_description text;

-- Hidden container service: repair bookings point their service_id here so
-- every services join/FK keeps working. is_active = false keeps it out of the
-- customer grids and the landing page; do not activate it.
insert into public.services (name, slug, category, description, starting_price_pence, display_order, is_active)
values (
  'Vehicle repair',
  'custom-repair',
  'other',
  'Container for one-off HaynesPro repair bookings — each booking is priced from the manufacturer book time for the exact repair. Do not activate.',
  0,
  999,
  false
)
on conflict (slug) do nothing;
