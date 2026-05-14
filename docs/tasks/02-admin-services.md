# Task 02 — Admin shell + services catalogue

**Status:** ✅ Complete. Stage 1 (auth), Stage 2 (admin shell), Stage 3 (services CRUD), and an added Stage 4 (settings sub-page + admin-managed categories) all shipped. The landing page's services preview reads real DB data; admin can manage the full catalogue including category CRUD.

Build the admin login flow, the admin app shell (sidebar nav, top bar), and the services catalogue CRUD. This is the first feature that requires auth, so we build the auth pieces here.

## Why this task

The services catalogue is the source of truth for what the booking flow lets customers book. If we built the booking flow first with hard-coded services, we'd rewrite it later when admin existed. Doing admin services now means the booking flow consumes real DB data from day one.

This task also introduces the admin shell, which subsequent admin tasks (live monitor, approvals, analytics) all build inside.

## Goal

A working `/admin` section gated by login, with a sidebar shell matching the dark navigation pattern from the brief, and a fully functional services CRUD page where the admin can add, edit, deactivate and reorder services.

## Three sub-stages

---

### Stage 1 — Auth (login + role gate) ✅

The admin login screen, sign-in / sign-out server actions and the role-gating middleware are all live.

**Acceptance criteria:**

- [x] `app/(admin)/admin/login/page.tsx` — login form with email + password (see deviations below — `react-hook-form` / `zod` skipped)
- [x] Server action `app/actions/sign-in.ts` calls `supabase.auth.signInWithPassword`
- [x] On successful sign-in, redirect to `/admin` (the route currently 404s — Stage 2 builds the overview)
- [x] On failure, surface the error message inline
- [x] `middleware.ts` updated to:
  - Refresh the session on every request (existing behaviour)
  - Redirect `/admin/*` (except `/admin/login`) to `/admin/login` if no session
  - Fetch the user's role from `profiles` and redirect to `/` if role isn't `admin`
  - Bounce already-signed-in admins away from `/admin/login` straight to `/admin`
- [x] Sign-out server action at `app/actions/sign-out.ts`
- [~] Login screen layout — see deviation below (50/50 split, not a centred card)

**Deviations from the original spec:**

- **No `react-hook-form` / `zod`.** Neither library is currently installed and the form is a single email + password pair. Plain HTML form + a few `if` checks in the server action covers it. When a more complex form needs validation (Stage 3 services CRUD is the next candidate), add `zod` then.
- **Form state via React 19's `useActionState`** in `login-form.tsx` — gives us inline error + pending state without a third-party form library.
- **50/50 split layout, not a centred card.** Left half is a brand-gradient panel (using the existing `bg-brand-gradient` token) with a watermark favicon anchored top-right at ~6% opacity and a marketing tagline. Right half is the form panel with the BMT wordmark centred above the form. Below `md:` (768px) the brand panel collapses to a short banner with a small centred favicon and the form fills the rest.
- **No standalone `app/(admin)/admin/login/layout.tsx`.** Metadata is set directly on the page. When Stage 2 introduces the admin shell layout, login will need to be moved into a route group (e.g. `app/(admin)/admin/(shell)/...`) so the shell doesn't wrap the login page. Flagged for Stage 2.
- **Two-layer admin role check.** Belt and braces: the sign-in server action checks `profiles.role === 'admin'` before completing the sign-in (returns a friendly "This account doesn't have admin access." error and clears the session if not). Middleware re-checks on every `/admin/*` request as the real authority.
- **Cookie carryover on redirect.** Middleware uses a small `redirectKeepingCookies` helper that copies any cookies Supabase wrote during session refresh onto the redirect response, so a session-refresh + redirect in the same request doesn't drop the refreshed tokens.
- **Assets added.** Copied `proposal/assets/logo-no-bg.png` and `proposal/favicon.png` into `public/` so the login page can reference them.

**Files touched:**
- `app/(admin)/admin/login/page.tsx`
- `app/(admin)/admin/login/_components/login-form.tsx` (client form — pulled out so the page can stay a server component with metadata)
- `app/actions/sign-in.ts`, `app/actions/sign-out.ts`
- `middleware.ts` (extended)
- `public/logo-no-bg.png`, `public/favicon.png` (new assets)

---

### Stage 2 — Admin shell ✅

The persistent UI structure every admin page lives inside. Dark sidebar on the left, top bar with breadcrumbs + global search + notification bell, placeholder pages for every nav item.

**Acceptance criteria:**

- [x] Admin shell layout wraps every admin route except `/admin/login` — implemented at `app/(admin)/admin/(shell)/layout.tsx` (see route-group deviation below, not at `app/(admin)/admin/layout.tsx`)
- [x] `components/admin/sidebar.tsx` — dark sidebar (`bg-text-primary`, 240px wide) with three nav groups:
  - **Operations** → Overview, All jobs, Live monitor, Disputes
  - **Network** → Mechanics, Approvals, Documents
  - **Commercial** → Pricing, Areas & demand, Analytics, Services
  - Active route highlighted brand-blue (driven by `usePathname()`)
  - BMT logo at the top (`logo-no-bg.png`, brightness-0 invert so it renders white)
  - User avatar + name + role + sign-out button at the bottom (`<form action={signOut}>` wrapping the bottom block)
- [x] `components/admin/top-bar.tsx` — top bar with:
  - `⌘K` global search input (UI only — `readOnly`, placeholder "Search bookings, mechanics, customers…")
  - Notification bell with red-dot indicator (no notifications wired yet)
  - Breadcrumbs on the left, derived from a static `CRUMBS` map keyed by pathname
- [x] Placeholder pages for every sidebar item — all 10 use a shared `PlaceholderPage` component at `app/(admin)/admin/(shell)/_components/placeholder-page.tsx` (eyebrow + title + "Coming soon" card)
- [x] Overview at `/admin` — welcome card with "Welcome back, {firstName}." and a CTA pointing at services. First name comes from `profiles.full_name`; falls back to the email's local-part or "there"

**Deviations from the original spec:**

- **Route group `(shell)` instead of `app/(admin)/admin/layout.tsx`.** Putting the shell layout at `app/(admin)/admin/layout.tsx` would wrap `app/(admin)/admin/login/page.tsx` too (Next.js layouts compose down the tree). The fix is the `(shell)` route group: shell-wrapped pages live under `app/(admin)/admin/(shell)/`, login stays at `app/(admin)/admin/login/`, and the URLs don't change (route groups are URL-invisible). The `(shell)/layout.tsx` is the admin shell.
- **User info in the sidebar bottom, not the top-bar right.** The spec says "current user's avatar + name on the right" of the top bar, but the proposal puts user info in the sidebar bottom (with a small settings icon). Matched the proposal because the user explicitly asked for the proposal designs to be reused. Sign-out is the icon button next to the avatar.
- **Breadcrumbs in the top bar** — not in the spec but in the proposal. Implemented as a small lookup table inside `top-bar.tsx` so the top bar can render context on its own without each page passing crumbs as props.
- **Dropped the recursive `Admins can view all profiles` RLS policy.** Discovered while testing Stage 1 — the policy's `EXISTS (SELECT … FROM profiles)` subquery on the same table caused infinite-recursion errors that broke the admin role check in `sign-in.ts`. Replaced with: just the "Users can view own profile" policy. Documented the gotcha + the `SECURITY DEFINER` fix in `docs/02-data-model.md` for when a later task needs admins to read other users' profiles. SQL run during this stage:
  ```sql
  drop policy if exists "Admins can view all profiles" on profiles;
  ```
- **`devIndicators: false` in `next.config.ts`** — turned off the Next.js dev-mode "N" badge at the user's request. Cosmetic; has no effect on production builds.
- **Logo sizing** — sidebar logo is `h-24` (96px) inside a `py-6` padded header band, not a fixed 104px header. Lets the brand mark dominate the top of the sidebar.

**Files touched:**
- `app/(admin)/admin/(shell)/layout.tsx` (new — admin shell)
- `app/(admin)/admin/(shell)/page.tsx` (new — overview welcome card)
- `app/(admin)/admin/(shell)/_components/placeholder-page.tsx` (new — shared "Coming soon" component)
- `app/(admin)/admin/(shell)/{jobs,live,disputes,mechanics,approvals,documents,pricing,areas,analytics,services}/page.tsx` (new — 10 placeholder pages)
- `components/admin/sidebar.tsx` (new)
- `components/admin/top-bar.tsx` (new)
- `next.config.ts` (updated — `devIndicators: false`)
- `docs/02-data-model.md` (updated — RLS recursion note)
- Supabase SQL: `drop policy "Admins can view all profiles" on profiles`

---

### Stage 3 — Services catalogue CRUD ✅

List, create, edit, deactivate and reorder services. Server actions, seeded catalogue, and the landing page's services-preview now reads real DB rows.

**Acceptance criteria:**

- [x] `app/(admin)/admin/(shell)/services/page.tsx` — list view (note `(shell)` route group, inherited from Stage 2)
- [x] `app/(admin)/admin/(shell)/services/new/page.tsx` — create form
- [x] `app/(admin)/admin/(shell)/services/[id]/edit/page.tsx` — edit form
- [x] Server actions in `app/actions/services.ts`: `createService`, `updateService`, `setServiceActive` (toggle, not separate deactivate), `reorderService`. All use the server Supabase client and respect admin RLS via `public.is_admin()`.
- [~] Form validation — done with plain server-side checks, not `zod`. See deviations.
- [x] Price input: `£` prefix on the client, `parsePrice("45.99") → 4599` server-side, stored in `starting_price_pence`
- [x] Toasts via `sonner` for success / error feedback — see deviation
- [x] Redirect back to list with `?flash=service-created` / `?flash=service-updated` query param picked up by `FlashToast` for the success toast
- [x] Seed migration `supabase/migrations/0001_seed_services.sql` with 10 services (Full Service, Diagnostic, Front Brake Pads, Battery Replacement, Clutch Replacement, MOT Pre-check, Interim Service, Front Brake Discs & Pads, Cambelt Replacement, Air-Con Regas) at the prices laid out in the spec
- [x] Landing-page services-preview verified rendering real DB data (top 6 by `display_order`); `SERVICE_META` icon map extended in `app/(customer)/_components/services-preview.tsx` so all new slugs render with proper icons; fallback `SEED_SERVICES` updated to mirror the top 6 of the seed in case of DB read failure

**Deviations from the original spec:**

- **No `zod`** — used plain server-side validation (`parseForm` in `app/actions/services.ts`). User had no experience with `zod` and the form is small; revisit when a complex multi-field form actually demands a schema library.
- **`sonner` toast library** — added as a new dependency (~3KB). Mounted `<Toaster richColors position="top-right" closeButton />` in `app/(admin)/admin/(shell)/layout.tsx`. A small `FlashToast` client component at `app/(admin)/admin/(shell)/_components/flash-toast.tsx` reads `?flash=...` after redirects, fires the matching toast, then strips the param from the URL.
- **Reorder via up/down arrow buttons**, not drag-and-drop. Reorder action swaps `display_order` with the immediate neighbour — two sequential UPDATEs (not atomic, fine at admin scale).
- **Single `setServiceActive(id, isActive)` action** instead of separate `deactivateService` / `reactivateService`. List-row power-icon toggles `is_active`; inactive rows render greyed out.
- **Slug field hidden from create + edit forms.** Auto-generated server-side from the name on create via `slugify(name)`, intentionally never touched on edit — `updateService` doesn't include `slug` in its update payload so renames don't break slug references (landing-page `SERVICE_META` keys by slug, etc.).
- **Shared constants moved to a non-action module.** Originally tried exporting `SERVICE_CATEGORIES` from `app/actions/services.ts`, which broke at runtime — every export from a `"use server"` file gets wrapped as a server-RPC function so `.map()` etc. fails on the client. Constants moved to `lib/services.ts`, then deleted entirely in Stage 4 once categories went DB-driven.
- **Custom `Select` primitive** at `components/ui/select.tsx` replaces native `<select>` elements in admin client UI (category dropdown, filter chips). Generic over value type, click-outside + keyboard navigation, basic ARIA. Saved as a project-wide memory so future client dropdowns reuse it.
- **List page is full-width** (no `max-w-5xl`) so the admin panel doesn't waste horizontal space. Form pages keep `max-w-3xl` because single-task editing reads better narrow. Pattern documented at the bottom of this file.
- **Two RLS gotchas resolved during testing** (now both documented in `docs/02-data-model.md` under "RLS patterns to follow"):
  - Inline `EXISTS (SELECT FROM profiles ...)` policies caused infinite recursion / context issues. Replaced with `public.is_admin()` `SECURITY DEFINER` function — used everywhere.
  - SELECT policy `using (is_active = true)` blocked admins from toggling `is_active = false` because Postgres requires the new row to remain visible via at least one SELECT policy after an UPDATE. Added a parallel `Admins can view all services` SELECT policy as the fix. This is now the canonical template for any soft-delete table.

**Files touched:**
- `app/(admin)/admin/(shell)/services/page.tsx` (replaced placeholder)
- `app/(admin)/admin/(shell)/services/new/page.tsx` (new)
- `app/(admin)/admin/(shell)/services/[id]/edit/page.tsx` (new)
- `app/(admin)/admin/(shell)/services/_components/service-form.tsx` (new — client form)
- `app/(admin)/admin/(shell)/services/_components/services-table.tsx` (new — client table)
- `app/(admin)/admin/(shell)/_components/flash-toast.tsx` (new)
- `app/(admin)/admin/(shell)/layout.tsx` (mounted `<Toaster />` + `<FlashToast />`)
- `app/actions/services.ts` (new — 4 server actions)
- `lib/utils.ts` (added `parsePrice` and `slugify`)
- `lib/services.ts` (added as the home for `SERVICE_CATEGORIES` / `ServiceCategory` / `CATEGORY_LABELS`; subsequently deleted in Stage 4 when categories went DB-driven)
- `components/ui/select.tsx` (new — custom dropdown primitive)
- `app/(customer)/_components/services-preview.tsx` (extended `SERVICE_META` and updated `SEED_SERVICES` fallback to match the new slug catalogue)
- `supabase/migrations/0001_seed_services.sql` (new — idempotent seed of 10 services)
- Supabase SQL run during this stage:
  ```sql
  create or replace function public.is_admin() ...
  drop policy if exists "Admins can insert services" on services;
  drop policy if exists "Admins can update services" on services;
  drop policy if exists "Admins can delete services" on services;
  create policy "Admins can insert services" on services for insert with check (public.is_admin());
  create policy "Admins can update services" on services for update using (public.is_admin()) with check (public.is_admin());
  create policy "Admins can delete services" on services for delete using (public.is_admin());
  create policy "Admins can view all services" on services for select using (public.is_admin());
  ```

---

### Stage 4 — Service settings sub-page + categories CRUD ✅

Added as an extension to the original Stage 3 scope when the user asked for admin-managed categories. Categories now live in a new `service_categories` table; `services.category` is a soft reference (text slug, no FK constraint) so renaming a category is free and existing rows never need migrating.

**Acceptance criteria:**

- [x] New table `service_categories` (id, name, slug, description, display_order, is_active, created_at, updated_at) with seeded 8 categories matching the previous static enum
- [x] RLS following the documented pattern: public SELECT (`is_active = true`), admin SELECT (all), admin INSERT/UPDATE/DELETE via `public.is_admin()`
- [x] Settings sub-page at `/admin/services/settings`, reached via a new "Settings" gear button on the services list page (next to "Add service")
- [x] Full CRUD on categories: list / create / edit / reorder (up-down) / deactivate-reactivate / delete
- [x] Hard delete is blocked when services reference the category — admin must reassign first; delete icon disabled with explanatory tooltip
- [x] Service form's category dropdown reads from `service_categories` instead of the static enum
- [x] Service form shows a friendly empty-state with a link to create a category if none exist yet
- [x] Service edit page passes all categories (active or not) so the current selection is always representable
- [x] Top-bar breadcrumbs updated to cover the new routes, including pattern-matching for `[id]/edit` paths so dynamic routes get sensible crumbs
- [x] `FlashToast` extended with `category-created` / `category-updated` / `category-deleted` keys

**Deviations / decisions:**

- **Slug field hidden from the category form too** (same call as services — auto on create, stable on edit). Renaming a category's display name is free; renaming its slug would break the soft reference from `services.category`.
- **Soft FK, not a real FK constraint.** `services.category` stays as a plain `text` column storing the slug. Trade-off taken: lighter migration, no destructive column drop; cost is the admin UI has to enforce semantic integrity (block deletes when in-use).
- **Native browser `confirm()` for the delete prompt** — quick win, fine for low-traffic admin. Could swap for a custom modal in a future UX polish round.
- **`lib/services.ts` deleted** — Stage 3 introduced it for the static enum, Stage 4 made it obsolete. No callers left.
- **Pre-emptively added the admin-view-all SELECT policy on `service_categories`** in the migration, having learned the Stage 3 lesson the hard way.

**Files touched:**
- `supabase/migrations/0002_service_categories.sql` (new — table + RLS + seed; also `create or replace function public.is_admin()` idempotently for fresh-environment safety)
- `app/actions/categories.ts` (new — `createCategory`, `updateCategory`, `setCategoryActive`, `reorderCategory`, `deleteCategory`)
- `app/(admin)/admin/(shell)/services/settings/page.tsx` (new — settings index, currently just the categories panel)
- `app/(admin)/admin/(shell)/services/settings/categories/new/page.tsx` (new)
- `app/(admin)/admin/(shell)/services/settings/categories/[id]/edit/page.tsx` (new)
- `app/(admin)/admin/(shell)/services/settings/_components/category-form.tsx` (new)
- `app/(admin)/admin/(shell)/services/settings/_components/categories-table.tsx` (new)
- `app/(admin)/admin/(shell)/services/page.tsx` (added Settings button; switched to DB categories; full-width layout)
- `app/(admin)/admin/(shell)/services/_components/service-form.tsx` (categories from prop, slug field removed)
- `app/(admin)/admin/(shell)/services/_components/services-table.tsx` (categories from prop, category-name lookup map)
- `app/(admin)/admin/(shell)/services/new/page.tsx` (fetches categories, passes to form)
- `app/(admin)/admin/(shell)/services/[id]/edit/page.tsx` (fetches categories, passes to form)
- `app/actions/services.ts` (slug removed from `updateService` payload; categories validated against DB rather than static enum)
- `app/(admin)/admin/(shell)/_components/flash-toast.tsx` (new keys)
- `components/admin/top-bar.tsx` (CRUMBS for new routes + pattern matcher for `[id]` segments)
- `lib/services.ts` (deleted)
- `docs/02-data-model.md` (schema + RLS-patterns section added/expanded)
- Supabase SQL run during this stage: the contents of `supabase/migrations/0002_service_categories.sql`, plus the `Admins can view all services` SELECT policy add-on (also documented in Stage 3's "Files touched" SQL block)

---

## Layout pattern locked in (carried forward to other admin pages)

- **List/dashboard pages** — no outer width cap, fill the panel. Tables and filters span full width.
- **Form pages (create/edit)** — `max-w-3xl mx-auto` so single-task editing isn't visually overwhelming.
- A `components/ui/kpi.tsx` primitive exists for future list pages that want a top stat strip. Services + Settings tried it and the user pulled it; pattern stays available for pages where the numbers actually mean something.

## What NOT to do in this task

- Don't build other admin features (live monitor, approvals, analytics, pricing) — they're separate tasks
- Don't build mechanic signup or customer signup flows — only admin login matters here
- Don't add a permissions system more granular than the role enum (admin vs not-admin is enough)
- Don't add audit logging — useful eventually but out of scope here
- Don't build a custom signup screen for new admins — admins are created manually via the dashboard, just like the first one
