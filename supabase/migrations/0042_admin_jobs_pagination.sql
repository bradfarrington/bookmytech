-- 0042 — Admin jobs list: paginate in SQL instead of capping at 1000 rows.
--
-- `/admin/jobs` fetched `.limit(1000)` and filtered in JS, so booking 1001
-- silently vanished from the list, the counts and the CSV export (which capped
-- at 5000). Same class of bug as the one 0041 fixed on the customers page.
--
-- Filtering + paging now happen in Postgres. Two things that needs from the DB:

-- 1. An index for the list's default ordering. `bookings_status_created_at_idx`
--    (0041) covers the filtered tabs; this covers the unfiltered "All" tab.
create index if not exists bookings_created_at_idx
  on public.bookings (created_at desc);

-- 2. The area filter's options. They used to be derived from whatever rows the
--    page had fetched — impossible once it only holds a page. `area` is the
--    postcode district derived by the `bookings_set_area` trigger (0004), not
--    the pricing `areas` table, so there's no lookup table to read instead.
create index if not exists bookings_area_idx
  on public.bookings (area)
  where area is not null;

-- security_invoker keeps the caller's RLS in force, so this leaks nothing the
-- caller couldn't already select: an admin sees every district, a customer only
-- their own bookings'. The jobs page reads under the admin's session (not the
-- service-role client), so the view must respect that.
create or replace view public.booking_area_options
  with (security_invoker = true)
as
select distinct area
from public.bookings
where area is not null;

comment on view public.booking_area_options is
  'Distinct postcode districts across bookings, for the admin jobs area filter. RLS-respecting.';

grant select on public.booking_area_options to authenticated, service_role;
