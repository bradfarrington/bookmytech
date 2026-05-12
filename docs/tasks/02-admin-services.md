# Task 02 — Admin shell + services catalogue

**Status:** ⏳ Queued

Build the admin login flow, the admin app shell (sidebar nav, top bar), and the services catalogue CRUD. This is the first feature that requires auth, so we build the auth pieces here.

## Why this task

The services catalogue is the source of truth for what the booking flow lets customers book. If we built the booking flow first with hard-coded services, we'd rewrite it later when admin existed. Doing admin services now means the booking flow consumes real DB data from day one.

This task also introduces the admin shell, which subsequent admin tasks (live monitor, approvals, analytics) all build inside.

## Goal

A working `/admin` section gated by login, with a sidebar shell matching the dark navigation pattern from the brief, and a fully functional services CRUD page where the admin can add, edit, deactivate and reorder services.

## Three sub-stages

---

### Stage 1 — Auth (login + role gate)

Build the admin login screen and the middleware logic that redirects unauthenticated or non-admin users away from `/admin/*` routes.

**Acceptance criteria:**

- [ ] `app/(admin)/admin/login/page.tsx` — login form with email + password, uses `react-hook-form` + `zod` validation
- [ ] Server action `app/actions/sign-in.ts` calls `supabase.auth.signInWithPassword`
- [ ] On successful sign-in, redirect to `/admin` (overview — built as placeholder for now)
- [ ] On failure, surface the error message inline
- [ ] Update `middleware.ts` to:
  - Check the user's session on every `/admin/*` request
  - Redirect to `/admin/login` if no session
  - Fetch the user's role from `profiles` and redirect to `/` (with an error message) if role isn't `admin`
  - Allow `/admin/login` itself to be accessed unauthenticated
- [ ] Sign-out server action at `app/actions/sign-out.ts`
- [ ] Login screen is its own minimal layout — no sidebar, no top bar (centred card on the surface background)

**Files touched:**
- `app/(admin)/admin/login/page.tsx`
- `app/(admin)/admin/login/layout.tsx` (minimal layout)
- `app/actions/sign-in.ts`, `app/actions/sign-out.ts`
- `middleware.ts` (updated)

---

### Stage 2 — Admin shell

The persistent UI structure every admin page lives inside. Dark sidebar on the left with three nav groups (Operations, Network, Commercial), top bar with global search and notification bell.

**Acceptance criteria:**

- [ ] `app/(admin)/admin/layout.tsx` — admin shell wrapping all admin routes except `/admin/login`
- [ ] `components/admin/sidebar.tsx` — dark sidebar with three nav groups:
  - **Operations** → Overview, All Jobs, Live Monitor, Disputes
  - **Network** → Mechanics, Approvals, Documents
  - **Commercial** → Pricing, Areas & Demand, Analytics, Services
  - Active route highlighted in brand blue
  - BMT logo / wordmark at the top
  - Sign-out button at the bottom
- [ ] `components/admin/top-bar.tsx` — top bar with:
  - `⌘K` global search input (just renders the UI for now — no search functionality yet, placeholder text "Search bookings, mechanics, customers…")
  - Notification bell icon (no notifications wired yet)
  - Current user's avatar + name on the right
- [ ] Placeholder pages for every sidebar item that doesn't exist yet — each renders just a heading and "Coming soon" so the sidebar links don't 404
- [ ] Overview placeholder at `/admin` shows a basic welcome card with the admin's name

**Files touched:**
- `app/(admin)/admin/layout.tsx`
- `app/(admin)/admin/page.tsx` (overview placeholder)
- Placeholder pages for each unbuilt nav item
- `components/admin/sidebar.tsx`
- `components/admin/top-bar.tsx`

---

### Stage 3 — Services catalogue CRUD

The first real admin feature. List, create, edit, deactivate and reorder services.

**Page structure:**

`/admin/services` — main list page with:
- Page heading "Services" + a primary button "Add service" (top right)
- Table or card-grid of all services (active and inactive), showing name, category, starting price, active toggle, display order
- Each row has Edit and Deactivate buttons
- Drag-and-drop reorder (or simple up/down arrow buttons if drag-and-drop is too much for one task — your call)
- Filter / search at the top: by category, by active status

`/admin/services/new` — create new service form

`/admin/services/[id]/edit` — edit existing service form

**Form fields:**
- Name (required, text)
- Slug (required, auto-generated from name but editable, unique check on save)
- Category (required, select from a fixed list: `service`, `diagnostic`, `brakes`, `tyres`, `battery`, `clutch`, `mot`, `other`)
- Description (optional, textarea)
- Starting price (required, displayed and entered as £ with decimal, stored as integer pence)
- Active (toggle, defaults to true on create)
- Display order (number input, defaults to next-highest available)

**Acceptance criteria:**

- [ ] `app/(admin)/admin/services/page.tsx` — list view
- [ ] `app/(admin)/admin/services/new/page.tsx` — create form
- [ ] `app/(admin)/admin/services/[id]/edit/page.tsx` — edit form
- [ ] Server actions in `app/actions/services.ts`: `createService`, `updateService`, `deactivateService`, `reorderServices`
- [ ] All actions use the server Supabase client and respect admin RLS policies
- [ ] Form validation with `zod` — name and slug required, slug uniqueness checked server-side, price validated as positive integer pence
- [ ] Price input handles £ formatting on the client (displays "£45.99", submits as `4599` pence)
- [ ] Toast / inline confirmation on successful create / update / deactivate (a simple text confirmation is fine — no need for a toast library yet)
- [ ] After successful create or edit, redirect back to the list with the new / updated service visible
- [ ] Seed 8–10 realistic services so the landing page's services preview has real data: Full Service, Interim Service, Diagnostic, Front Brake Pads, Front Brake Discs & Pads, Battery Replacement, MOT Pre-check, Clutch Replacement, Cambelt Replacement, Air-Con Regas. Reasonable starting prices for each.
- [ ] After this task, the landing page's services preview (built in task 01) should automatically render real services from the DB — verify this works

**Files touched:**
- `app/(admin)/admin/services/page.tsx`
- `app/(admin)/admin/services/new/page.tsx`
- `app/(admin)/admin/services/[id]/edit/page.tsx`
- `app/(admin)/admin/services/_components/` (page-specific composites — service-form, services-table)
- `app/actions/services.ts`
- `lib/utils/price.ts` (helpers: `parsePrice("45.99") → 4599`, `formatPrice(4599) → "£45.99"`)
- Manual SQL or seed script to insert the 10 services

## What NOT to do in this task

- Don't build other admin features (live monitor, approvals, analytics, pricing) — they're separate tasks
- Don't build mechanic signup or customer signup flows — only admin login matters here
- Don't add a permissions system more granular than the role enum (admin vs not-admin is enough)
- Don't add audit logging — useful eventually but out of scope here
- Don't build a custom signup screen for new admins — admins are created manually via the dashboard, just like the first one

## When complete

- Update `docs/HANDOFF.md`:
  - Mark task 02 as ✅ Complete
  - Set current task to `03-booking-flow.md`
- Commit and push
