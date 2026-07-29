-- 0041 — Admin customers area: booking indexes + a SQL-aggregated customer summary.
--
-- Two problems this fixes, both of which bite well before "the table gets big":
--
--  1. SILENT TRUNCATION. Supabase's auto-generated API caps an unbounded
--     `.select()` at the project's max-rows setting (1000 by default). Any admin
--     page that fetched every booking to roll it up in JS would quietly compute
--     its totals from the first 1000 rows and show a confidently wrong number.
--     Aggregating in SQL and paginating the result removes the whole class.
--
--  2. NO INDEXES ON `bookings`. Until now the table had none beyond its primary
--     key: every filter on customer_id / customer_email / mechanic_id / status
--     was a sequential scan. That's the customer dashboard, the mechanic detail
--     page, dispatch and the admin job lists — not just this feature.

-- ─── Indexes ────────────────────────────────────────────────────────────────

-- The customer dashboard and admin customer pages resolve bookings by id OR
-- email (the email arm only matches historic guest rows that predate
-- account-at-checkout; `linkGuestBookings` stamps the id on the rest).
create index if not exists bookings_customer_id_idx
  on public.bookings (customer_id);

create index if not exists bookings_customer_email_lower_idx
  on public.bookings (lower(customer_email));

-- Mechanic job lists, earnings and the balance ledger.
create index if not exists bookings_mechanic_id_idx
  on public.bookings (mechanic_id);

-- Admin jobs list + live monitor order by created_at within a status.
create index if not exists bookings_status_created_at_idx
  on public.bookings (status, created_at desc);

-- Dispatch, the day view and reminder sweeps all filter on the slot.
create index if not exists bookings_scheduled_at_idx
  on public.bookings (scheduled_at);

-- Disputes are always resolved back to their booking.
create index if not exists disputes_booking_idx
  on public.disputes (booking_id);

-- ─── Customer summary view ──────────────────────────────────────────────────
--
-- One row per customer account with the rollups the admin list needs, so the
-- page can search / sort / paginate in SQL and never read more than a screenful.
--
-- Deliberately NOT included: account credit. `availableCreditPence()` owns that
-- rule (non-expired rows, clamped at 0) and the detail page calls it directly —
-- duplicating it here would give us two definitions that can drift.
--
-- The view joins auth.users for email + signup date (profiles has neither). It
-- therefore runs with owner privileges (the default for a view — NOT
-- security_invoker) and is granted to service_role ONLY. Every admin page
-- already reads through the service-role client behind the middleware admin
-- gate; anon and authenticated must never see this.

create or replace view public.customer_admin_summary as
select
  p.id,
  p.full_name,
  p.phone,
  p.referral_code,
  u.email,
  u.created_at        as joined_at,
  u.last_sign_in_at,
  coalesce(b.bookings_count, 0)    as bookings_count,
  coalesce(b.completed_count, 0)   as completed_count,
  coalesce(b.total_spent_pence, 0) as total_spent_pence,
  b.last_booking_at,
  coalesce(d.open_disputes, 0)     as open_disputes
from public.profiles p
join auth.users u on u.id = p.id
left join lateral (
  select
    count(*)                                        as bookings_count,
    count(*) filter (where bk.status = 'completed') as completed_count,
    coalesce(
      sum(bk.total_pence) filter (where bk.status = 'completed'), 0
    )                                               as total_spent_pence,
    max(bk.created_at)                              as last_booking_at
  from public.bookings bk
  where bk.customer_id = p.id
     or (bk.customer_id is null and lower(bk.customer_email) = lower(u.email))
) b on true
left join lateral (
  select count(*) as open_disputes
  from public.disputes ds
  join public.bookings bk on bk.id = ds.booking_id
  where ds.status in ('opened', 'responded', 'escalated')
    and (
      bk.customer_id = p.id
      or (bk.customer_id is null and lower(bk.customer_email) = lower(u.email))
    )
) d on true
where p.role = 'customer';

comment on view public.customer_admin_summary is
  'Admin-only customer rollups (jobs, spend, open disputes). Reads auth.users — service_role only.';

revoke all on public.customer_admin_summary from anon, authenticated;
grant select on public.customer_admin_summary to service_role;
