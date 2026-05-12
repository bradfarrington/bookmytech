# Task 04 — Admin live monitor + manual mechanic creation

**Status:** ⏳ Queued

Build the admin overview dashboard and the live monitor that the brief describes in section 5. Add the ability to manually create mechanic profiles from admin (proper onboarding flow comes later in task 07).

## Why this task

Bookings exist now (after task 03). The brief makes a big deal of the operations team being able to "watch the marketplace run from one dashboard" — that visibility doesn't exist yet. This task gives ops eyes on the system.

Also, the booking flow is creating bookings against fake seeded mechanics. We need a real way to add and manage them, even if the proper application/approval flow isn't built yet.

## Three sub-stages

---

### Stage 1 — Schema additions

Bookings need a few more columns to support the live monitor properly, and we need a `mechanics` extension table for mechanic-specific data.

**`mechanics` table** — extends `profiles` for mechanic-specific data:

```sql
create table mechanics (
  id uuid primary key references profiles(id) on delete cascade,
  status text not null default 'offline', -- 'online' | 'offline' | 'on_job'
  service_radius_miles integer not null default 10,
  base_postcode text,
  bio text,
  specialisms text[] default '{}',
  rating numeric(3,2) default 0,
  job_count integer not null default 0,
  is_pro boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table mechanics enable row level security;

create policy "Mechanics can view own record"
  on mechanics for select using (auth.uid() = id);

create policy "Admins can view all mechanics"
  on mechanics for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admins can manage mechanics"
  on mechanics for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
```

**Booking additions:**

```sql
alter table bookings add column area text; -- postcode district, e.g. "SE15"
alter table bookings add column en_route_at timestamptz;
alter table bookings add column started_at timestamptz;
alter table bookings add column completed_at timestamptz;
```

`status` values from this task onward: `'pending'`, `'confirmed'`, `'en_route'`, `'in_progress'`, `'completed'`, `'cancelled'`, `'disputed'`.

**Acceptance criteria:**

- [ ] Migration SQL written and run against Supabase
- [ ] `docs/02-data-model.md` updated to reflect new tables / columns

---

### Stage 2 — Overview dashboard with KPIs

The admin home screen at `/admin`. Replace the placeholder built in task 02.

**Layout (per brief section 5):**

- Five KPI cards across the top:
  1. **Live bookings** — count of bookings with status in ('confirmed', 'en_route', 'in_progress')
  2. **GMV today** — sum of total_pence for bookings created today
  3. **Take-rate** — fixed at 15% for now (will be dynamic once pricing engine exists)
  4. **Mechanics online** — count of mechanics with status='online'
  5. **Avg time-to-accept** — placeholder ("—" with a note "Available once dispatch is automated")
- Live monitor table below — every active booking in real time:
  - Columns: ID (short), Service, Customer, Mechanic, Area, Status pill, Value
  - Filterable tabs: All, Live, Pending, Complete, Disputed (default: Live)
  - Realtime via Supabase Realtime — table re-renders when booking rows change
- "Needs your attention" panel on the right:
  - Undersupplied areas (postcodes with bookings but no online mechanics)
  - Mechanic performance flags (mechanics with avg rating < 4.0 — none for now)
  - Open disputes (count, empty for now)
- Demand-by-area bar chart at the bottom:
  - Horizontal bars showing booking count per postcode district
  - Warning indicator if area has bookings but < 2 online mechanics

**Acceptance criteria:**

- [ ] `app/(admin)/admin/page.tsx` rebuilt with the full overview
- [ ] Five KPI cards rendering real data
- [ ] Live monitor table fetches via server component on initial load, then subscribes to Supabase Realtime for updates
- [ ] Status pills coloured per design system (blue for live, green for complete, amber for pending, red for disputed)
- [ ] "Needs your attention" panel renders empty states gracefully
- [ ] Demand-by-area chart uses `recharts`, pulls aggregated data from a Supabase view or RPC
- [ ] Page fully responsive, but desktop-optimised (admin is desktop-only per brief)

**Files touched:**
- `app/(admin)/admin/page.tsx`
- `app/(admin)/admin/_components/kpi-cards.tsx`
- `app/(admin)/admin/_components/live-monitor.tsx`
- `app/(admin)/admin/_components/needs-attention.tsx`
- `app/(admin)/admin/_components/demand-chart.tsx`
- `lib/supabase/realtime.ts` (helper for subscribing to changes)
- Supabase view or RPC for area aggregation

---

### Stage 3 — All bookings + manual mechanic creation

The full filterable bookings table and a basic mechanic admin.

**Bookings page** at `/admin/bookings`:

- Full table — all bookings ever, paginated
- Filters at the top: date range, area, service, mechanic, status
- Tabs: All / Live / Pending / Complete / Disputed
- Each row clickable → opens a detail view at `/admin/bookings/[id]`
- Export to CSV button (top right)
- "Create manual booking" button (top right) — opens a form for back-office bookings (e.g. taken over the phone)

**Booking detail page** at `/admin/bookings/[id]`:

- Full booking details: customer, mechanic, vehicle, service, slot, address, parking, special instructions
- Timeline showing status changes
- Stripe payment status (pre-auth / captured / refunded)
- Actions: Cancel booking (with reason), Reassign mechanic, Mark as disputed

**Mechanics page** at `/admin/mechanics`:

- Table of all mechanics: name, postcode, status, rating, job count, is_pro
- Filter by status
- Each row → detail at `/admin/mechanics/[id]`
- "Add mechanic" button → manual creation form:
  - Email (creates auth.users + profile + mechanics row)
  - Full name
  - Phone
  - Base postcode
  - Service radius (default 10 miles)
  - Specialisms (multi-select)
  - Initial password (or send a magic link via Supabase)
- This is a placeholder until proper mechanic onboarding lands in task 07

**Acceptance criteria:**

- [ ] `app/(admin)/admin/bookings/page.tsx` + filters + tabs
- [ ] `app/(admin)/admin/bookings/[id]/page.tsx` with timeline, payment status, actions
- [ ] `app/(admin)/admin/mechanics/page.tsx` listing
- [ ] `app/(admin)/admin/mechanics/[id]/page.tsx` detail (basic — full profile editing comes in task 05)
- [ ] `app/(admin)/admin/mechanics/new/page.tsx` create form
- [ ] Server actions: `cancelBooking`, `reassignMechanic`, `markDisputed`, `createMechanic`
- [ ] CSV export server action
- [ ] All seeded fake mechanics from task 03 visible in `/admin/mechanics` — clean up seed data if needed

**Files touched:**
- `app/(admin)/admin/bookings/page.tsx`
- `app/(admin)/admin/bookings/[id]/page.tsx`
- `app/(admin)/admin/mechanics/page.tsx`
- `app/(admin)/admin/mechanics/[id]/page.tsx`
- `app/(admin)/admin/mechanics/new/page.tsx`
- `app/actions/bookings.ts`, `app/actions/mechanics.ts`

## What NOT to do in this task

- Don't build the mechanic-facing dashboard — that's task 05
- Don't build proper mechanic onboarding / approvals queue — that's task 07
- Don't build analytics (GMV trends, funnel, etc.) — that's a later task
- Don't build pricing controls / area multipliers — that's a later task
- Don't build the disputes resolution UI — flagging a booking as disputed is enough for now

## When complete

- Update `docs/HANDOFF.md`:
  - Mark task 04 ✅ Complete
  - Set current task to `05-mechanic-dashboard.md`
- Commit and push
