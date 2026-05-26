# HANDOFF — Claude, read this first

You are working on **Book My Tech**, a UK mobile-mechanic booking platform. This document tells you where the project stands right now and what to work on next.

## Read these in order before doing anything else

1. **`docs/00-working-brief.md`** — the full product spec. The source of truth for what we're building and why.
2. **`docs/01-architecture.md`** — codebase structure, conventions, and what NOT to do.
3. **`docs/02-data-model.md`** — current Supabase schema and patterns.
4. **`docs/03-design-system.md`** — brand tokens, Tailwind v4 setup, component patterns.
5. **The currently active task in `docs/tasks/`** — see "Current task" below.

## Project state

**Stack:** Next.js 16 (App Router, TypeScript, Turbopack) · React 19 · Tailwind v4 (CSS-first `@theme`) · Supabase · Vercel · `@/*` import alias

**What's done:**
- **Foundation complete** (`docs/tasks/00-foundation.md`)
  - Next.js project scaffolded with Tailwind v4, TypeScript, App Router
  - Supabase project provisioned in eu-west-2; three tables (`profiles`, `services`, `bookings`) with RLS
  - Supabase clients wired (`lib/supabase/client.ts`, `lib/supabase/server.ts`)
  - Auth middleware in place (`middleware.ts`) — no login screens yet, just the plumbing
  - Route groups created: `app/(customer)/`, `app/(mechanic)/`, `app/(admin)/`
  - Admin user exists in Supabase (manually promoted via SQL)
  - Repo on GitHub, deployed to Vercel
  - Proposal JSX mockups added to `/proposal/` for reference
- **Task 02 ✅ complete** (`docs/tasks/02-admin-services.md`) — admin auth, admin shell, services CRUD, and an added Stage 4 (settings sub-page + admin-managed categories) all shipped. Landing page's services preview now reads real DB rows. Two RLS gotchas documented in `docs/02-data-model.md`.
  - **Stage 3 — services CRUD + seed**
    - `app/(admin)/admin/(shell)/services/page.tsx` — list page, full-width, server-fetches services + active categories, renders `<ServicesTable />`. Header has "Settings" (gear) and "Add service" buttons.
    - `app/(admin)/admin/(shell)/services/new/page.tsx` + `[id]/edit/page.tsx` — create/edit pages, narrow (`max-w-3xl`), server-fetch categories and pass to the form. Edit page passes all categories (active or not) so the current selection is representable even if its category was later deactivated.
    - `app/(admin)/admin/(shell)/services/_components/service-form.tsx` — controlled client form. Slug field is **hidden**: auto-generated server-side from name on create, never updated on edit (stable references). Category select is the custom primitive driven by the prop.
    - `app/(admin)/admin/(shell)/services/_components/services-table.tsx` — client table. Filters (category, status) use the custom Select. Each row has up/down reorder, edit link, power-icon toggle. `is_active=false` rows render greyed out.
    - `app/actions/services.ts` — 4 actions: `createService`, `updateService` (slug excluded from payload — stable), `setServiceActive` (toggle), `reorderService` (swap display_order with neighbour). All run under the user's session and rely on admin RLS.
    - `lib/utils.ts` — added `parsePrice("£45.99") → 4599` and `slugify("Front Brake Pads") → "front-brake-pads"`. `formatPrice` was already there.
    - `supabase/migrations/0001_seed_services.sql` — idempotent (`on conflict (slug) do nothing`) seed of 10 services with slugs matching the landing-page `SERVICE_META` icon map. Top 6 by `display_order` render with proper icons; remaining 4 use the wrench fallback.
    - `app/(customer)/_components/services-preview.tsx` — `SERVICE_META` extended for the 10 new slugs; `SEED_SERVICES` fallback rewritten to match the top 6 of the seed so a DB read failure still renders sensibly.
    - **Toasts via `sonner`** (~3KB) — `<Toaster richColors position="top-right" closeButton />` mounted in the shell layout. `FlashToast` client component (in `_components/`) reads `?flash=...` after redirects, fires the toast, strips the param.
    - **Custom `Select` primitive** at `components/ui/select.tsx` — replaces native `<select>` everywhere in admin client UI. Generic over value type, click-outside + keyboard nav + basic ARIA. **Project memory saved** at `~/.claude/projects/-Users-bradfarrington-Downloads-bookmytech/memory/select-primitive.md` reminding future Claude sessions to use this primitive, never native `<select>`.
    - **List vs form layout pattern locked in**: list/dashboard pages drop `max-w-*` and fill the panel; form pages keep `max-w-3xl mx-auto`. `components/ui/kpi.tsx` exists as a primitive but isn't currently used (added during a KPI-strip experiment that was reverted by the user — kept for future pages with meaningful stats).
    - **RLS lessons** (now canonicalised in `docs/02-data-model.md` under "RLS patterns to follow"):
      - Pattern #1 — `public.is_admin()` `SECURITY DEFINER` function as the single role check. Use everywhere; never inline `EXISTS (SELECT FROM profiles ...)`.
      - Pattern #2 — any soft-delete (`is_active` toggle) table needs **two** SELECT policies: public sees active, admin sees all. Without the admin one, UPDATEs that flip `is_active = false` fail RLS because the new row state would be invisible to SELECT.
  - **Stage 4 — service settings sub-page + categories CRUD**
    - New table `service_categories` (id, name, slug, description, display_order, is_active, timestamps). Soft-FK from `services.category` to `service_categories.slug` (text column, no FK constraint — lighter migration, integrity enforced in admin UI).
    - `supabase/migrations/0002_service_categories.sql` — table + RLS (following pattern #2) + idempotent seed of the 8 categories matching the static enum slugs.
    - `app/actions/categories.ts` — 5 actions: `createCategory`, `updateCategory`, `setCategoryActive`, `reorderCategory`, `deleteCategory`. Delete is blocked when services reference the category (returns a count-aware friendly error).
    - Settings sub-page at `/admin/services/settings` with a categories panel. Reached via a new "Settings" (gear) button on the services list page. Designed to grow — more settings sections will live here.
    - Full CRUD on categories: list / create / edit / reorder / toggle active / delete. Slug field hidden on the category form same as services.
    - Service form's category dropdown is now DB-driven. Empty state with a deep-link to "create a category first" if no active categories exist.
    - Top-bar breadcrumbs updated with pattern matching for `[id]/edit` routes so dynamic pages get sensible crumbs.
    - `FlashToast` extended with `service-created`, `service-updated`, `category-created`, `category-updated`, `category-deleted`.
    - `lib/services.ts` (Stage 3 home for the static category enum) was deleted entirely once categories went DB-driven.
  - **Stage 1 — auth**
    - `app/(admin)/admin/login/page.tsx` — 50/50 split layout: brand-gradient panel left (watermark favicon top-right at ~6% opacity, marketing tagline bottom), form panel right (centred BMT wordmark above the form). Collapses to a stacked layout below `md:` with a small centred favicon in the banner.
    - `app/(admin)/admin/login/_components/login-form.tsx` — client form using React 19's `useActionState` for inline error + pending state. No `react-hook-form` / `zod` — plain HTML + server-side checks.
    - `app/actions/sign-in.ts` — calls `supabase.auth.signInWithPassword`, double-checks `profiles.role === 'admin'` before completing (friendly "This account doesn't have admin access." error otherwise), then redirects to `/admin`.
    - `app/actions/sign-out.ts` — `signOut()` then redirect to `/admin/login`.
    - `middleware.ts` — extended with `/admin/*` role gate: redirects to `/admin/login` if no session, redirects to `/` if role ≠ admin. Bounces already-signed-in admins away from `/admin/login` to `/admin`. Uses a `redirectKeepingCookies` helper so session refresh + redirect in one request doesn't drop tokens.
    - Assets: `public/logo-no-bg.png` + `public/favicon.png` copied from `proposal/`.
  - **Stage 2 — admin shell**
    - `app/(admin)/admin/(shell)/layout.tsx` — admin shell: fetches user + profile, renders sidebar + top-bar + main. Wraps every admin route except `/admin/login` because login sits outside the `(shell)` route group (see below).
    - `app/(admin)/admin/(shell)/page.tsx` — overview welcome card: "Welcome back, {firstName}." + an "Open services" CTA. First name derives from `profiles.full_name` → falls back to email local-part → "there".
    - `app/(admin)/admin/(shell)/_components/placeholder-page.tsx` — shared "Coming soon" composite used by every placeholder page.
    - 10 placeholder pages under `(shell)/`: `jobs`, `live`, `disputes`, `mechanics`, `approvals`, `documents`, `pricing`, `areas`, `analytics`, `services` — each is a one-liner using `PlaceholderPage`.
    - `components/admin/sidebar.tsx` — dark sidebar (240px, `bg-text-primary`), three nav groups (Operations / Network / Commercial, 11 links total), active link highlighted brand-blue via `usePathname()`. BMT logo top (`h-24`, brightness-0 invert). User avatar + name + role at the bottom with a sign-out button (`<form action={signOut}>`).
    - `components/admin/top-bar.tsx` — breadcrumbs (from a static `CRUMBS` map keyed by pathname), `⌘K` search input (readOnly UI placeholder), notification bell with red-dot indicator.
    - **RLS gotcha resolved** — dropped `Admins can view all profiles` on `profiles` because its `EXISTS (SELECT … FROM profiles)` subquery caused infinite-recursion errors that broke the role check in `sign-in.ts`. Documented in `docs/02-data-model.md` with the `SECURITY DEFINER` pattern to use when an admin-read-all policy is needed back. SQL run during this stage:
      ```sql
      drop policy if exists "Admins can view all profiles" on profiles;
      ```
    - `next.config.ts` — `devIndicators: false` to hide the Next dev-mode "N" badge (cosmetic, no production effect).
  - Verified end-to-end: signed in as admin, hit every sidebar link, sign-out returns to `/admin/login`. Unauthenticated probes: every `/admin/*` returns 307 → `/admin/login`; `/admin/login` 200; `/` 200 (no regression).
- **Task 01 complete** (`docs/tasks/01-landing-and-dvla.md`) — including DVLA wiring (carve-out now closed)
  - Design tokens encoded in `app/globals.css` via Tailwind v4 `@theme` (brand colours, surfaces, borders, text scale, radii, shadows, gradient, max-width)
  - Inter wired via `next/font/google` in `app/layout.tsx`
  - 10 UI primitives extracted to `components/ui/`: `Button`, `Card`, `Pill`, `Icon`, `Avatar`, `Stars`, `Overline`, `TrustBadge`, `RegPlateInput`, `CustomerNav`
  - `cn()` helper + `normaliseReg()` + `formatPrice()` in `lib/utils.ts`
  - Full landing page at `/` — 9 sections: hero, trust strip, how-it-works, reviews, services preview, why BMT, FAQ, final CTA, footer
  - Page-specific composites in `app/(customer)/_components/`
  - **DVLA reg-plate lookup live end-to-end:**
    - `lib/dvla/{client,types}.ts` — POSTs to DVLA VES with `x-api-key`; stub mode for `LB21 XYZ` / `AB12 CDE` / `XY99 ZZZ` when `DVLA_API_KEY` is empty
    - `lib/dvla/mot-client.ts` — DVSA MOT History API (OAuth2 client-credentials, module-level token cache) supplies the `model` field that DVLA VES doesn't return
    - `app/actions/lookup-vehicle.ts` — server action validates plate regex, runs VES + MOT in parallel, merges `model` onto the response
    - `vehicle-lookup-modal.tsx` renders the real `VehicleDetails` (make/model/year, colour, fuel, engine, MOT + tax with tone-coded pills)
    - `reg-lookup-form.tsx` uses `useTransition` (not `useActionState`) so the modal can open immediately in `loading` state and update in place
  - Services preview pulls from the `services` Supabase table with a seeded fallback (table currently empty)
  - Production build passes; `/` serves as a dynamic SSR route due to the Supabase read

- **Task 03 ✅ complete** (`docs/tasks/03-booking-flow.md`) — guest customer can complete a booking end-to-end (reg → vehicle → service → price → slot → Stripe pre-auth → confirmation row). Verified manually on 2026-05-26 with the Stripe test card. Booking row inserts with `status = 'sourcing_mechanic'` (kept as a real lifecycle state — "pre-auth held, no mechanic assigned yet"; Task 04 extends the enum from this baseline).
  - **Stage 1 — shell + stepper** — [layout.tsx](../app/(customer)/book/layout.tsx) with minimal header, [progress-stepper.tsx](../components/customer/progress-stepper.tsx). Routes: `/book` (entry / redirect when `?reg=` present), `/book/vehicle`, `/book/service`, `/book/match`, `/book/slot`, `/book/confirmed/[id]`. State threaded via URL params (`reg`, `make`, `model`, `postcode`, `service`).
  - **Stage 2 — vehicle confirm** — DVLA + DVSA result rendered in [vehicle-confirm-card.tsx](../app/(customer)/book/vehicle/_components/vehicle-confirm-card.tsx) with green check, "Yes, this is my car" CTA, "Edit manually" fallback ([manual-vehicle-form.tsx](../app/(customer)/book/vehicle/_components/manual-vehicle-form.tsx)). Error state with "Try a different reg" branch. **DVLA lookup now cached in-memory for 5 minutes per reg** ([lookup-vehicle.ts](../app/actions/lookup-vehicle.ts)) so back-navigation between steps doesn't re-hit VES + MOT.
  - **Stage 3 — service selection** — [service-grid.tsx](../app/(customer)/book/service/_components/service-grid.tsx) reads active services from the DB. Search bar filters client-side. Six primary slugs (`full-service`, `diagnostic`, `brakes-tyres`, `battery`, `clutch-gears`, `mot-pre-check`) shown as the main grid with starting prices; `diagnostic` flagged "Most popular". "Not sure what's wrong?" card → diagnostic. Expandable "More services" section below for the other four.
  - **Stage 4 — price hero** — [price-hero.tsx](../app/(customer)/book/match/_components/price-hero.tsx). Big gradient card with fixed price, service name, what's-included list, pre-auth transparency note. Trust row (vetted / 12-month / no fix no fee). "What happens next?" copy explaining backend dispatch. **No mechanic shown** — per the resolved client decisions.
  - **Stage 5 — slot + Stripe pre-auth** — [slot-picker.tsx](../app/(customer)/book/slot/_components/slot-picker.tsx). 7-day horizontal date strip, three-slot time grid (Morning / Afternoon / Evening) with "Popular" badge on afternoon and "Last" badge on evening. Address field, **separate postcode field** (pre-filled from the hero when supplied), parking-type **using the custom `Select` primitive**, special-instructions textarea, sticky bottom CTA with the pre-auth amount. On confirm: `createPaymentIntentAction` creates a `manual`-capture PaymentIntent, Stripe Elements card form is rendered in-place, and the booking row is inserted via `createBookingAction` only after the pre-auth succeeds. Confirmation email fires (Resend; falls back to a console stub when `RESEND_API_KEY` is missing). Redirects to `/book/confirmed/[id]`.
  - **Confirmation screen** — [confirmed/[id]/page.tsx](../app/(customer)/book/confirmed/[id]/page.tsx). Reference, animated "Finding your mechanic" status, full booking summary, "no money has left your account" note, placeholder "Create an account to track" CTA. **Reads via the service-role client** (`lib/supabase/admin.ts`) — guests have no session, so the customer-scoped SELECT policy would otherwise block them seeing their own confirmation.
  - **Customer-facing copy avoids "deposit".** Right now the full service price is pre-authorised on the card (e.g. £45 for a diagnostic). The long-term model in the brief / resolved-decisions is a partial deposit; the copy was switched to "amount pre-authorised" / "your card is pre-authorised" so we don't promise something that isn't shipping. Revisit the wording when the partial-deposit model lands.
  - **Hero → /book wiring** — `reg-lookup-form.tsx` now pushes to `/book/vehicle?reg=<reg>&postcode=<postcode>` on "Continue to booking". Postcode is threaded all the way through to the slot step and pre-fills the postcode field.
  - **Schema** — `supabase/migrations/0003_booking_flow.sql` adds `stripe_payment_intent_id`, `customer_email`, `customer_name`, `address_line_1`, `address_line_2`, `parking_type`, `special_instructions` to `bookings`, enables RLS, and installs five policies (insert open, customer SELECT/UPDATE scoped, admin SELECT/UPDATE via `public.is_admin()`). **Verify this has been applied to the Supabase project before testing end-to-end.**
  - **Resolved client decisions consumed** — `memory/project_resolved_decisions.md` (kickoff Q&A on 2026-05-22): no surge pricing; pre-auth held until job complete; "vetted professionals" copy throughout; mechanic is hidden from the customer during booking — assigned by backend dispatch after the booking is placed.

**What's not done:**
- **Partial-deposit model** — the brief / resolved-client-decisions describe a partial deposit pre-authorised at booking, with the remainder taken on completion. Current implementation pre-authorises the full service price. Customer-facing copy was switched to "amount pre-authorised" / "your card is pre-authorised" so we don't mislead. Revisit and reintroduce "deposit" wording when the partial-deposit split is built (likely alongside task 08 — Stripe Connect / mechanic payouts).
- **`/signup` doesn't exist yet.** The confirmation page's "Create an account to track your booking" CTA links to `/signup` and 404s. Customer signup + tracking dashboard land in task 09.
- **`RESEND_API_KEY` not configured.** The booking-confirmation email currently hits the console stub in `lib/email/send.ts`. Add the key and the real send wakes up — no code change needed.
- **Admins-can-read-all-profiles RLS policy** — dropped during Task 02 Stage 1 because of recursion. When a feature needs it back (mechanic approvals etc.), reintroduce via the `public.is_admin()` `SECURITY DEFINER` function as documented in `docs/02-data-model.md` — never with an inline subquery on `profiles`.
- **Mechanic / customer login** — same pattern as admin login but at `/login` (shared) or per-role. Lands at whichever task first needs it (mechanic onboarding is task 07).
- **`middleware.ts` → `proxy.ts` rename** — Next 16 dev server logs the deprecation warning on startup. Trivial follow-up: rename the file and the exported function name from `middleware` to `proxy`.
- **Tablet (768px) and mobile (375px) polish** — desktop (1280px) looks right; the 768/375 layouts were re-worked in commit `ac0afe7` but treat as a candidate for further design tweaks before going further on customer-facing pages.

## Current task

**Next: Task 04 — admin live monitor + manual mechanic creation (`docs/tasks/04-admin-live-monitor.md`).** Task 03 fully complete. Three sub-stages:

1. **Schema** — `mechanics` extension table on top of `profiles`; new booking columns (`area`, `en_route_at`, `started_at`, `completed_at`). The status enum extends from `'sourcing_mechanic'` (already in use) to `'sourcing_mechanic' | 'confirmed' | 'en_route' | 'in_progress' | 'completed' | 'cancelled' | 'disputed'`. Note: Task 04's spec was originally written with `'pending'` as the first state — we're keeping `'sourcing_mechanic'` instead because it describes the real lifecycle phase better. The spec doc needs a small reconciliation pass once we start.
2. **Overview dashboard** — replaces the placeholder at `/admin`. Five KPI cards, live monitor table backed by Supabase Realtime, "needs your attention" panel, demand-by-area bar chart (`recharts`).
3. **All-bookings + mechanic admin** — filterable bookings table + detail page (cancel/reassign/mark-disputed), mechanics listing, manual mechanic-creation form (placeholder until proper onboarding lands in task 07).

**Watch-outs for Task 04:**
- **`mechanics` table RLS** — the spec sketch uses inline `EXISTS (SELECT FROM profiles WHERE role='admin')` subqueries. **Use `public.is_admin()` instead** (RLS pattern #1 in `docs/02-data-model.md`) to avoid the recursion bug we hit in Task 02.
- **Status enum alignment.** Any UPDATE on the `status` column should use the agreed lifecycle. The seed data won't transition statuses automatically — `'sourcing_mechanic'` rows stay there until task 05 (mechanic dashboard) wires up acceptance.
- **`recharts` is a new dependency.** Add it as part of Stage 2.
- **Realtime needs a Supabase subscription.** No existing helper — Stage 2 introduces `lib/supabase/realtime.ts`.
- **Mechanics seeded from manual creation only.** The booking flow currently doesn't reference any mechanic_id (per Task 03 spec — no mechanic data needed). Manual creation in Stage 3 gives us seedable rows for Stage 2's KPIs.
- **`sonner` is wired** at the admin shell layout but not at the customer side yet. If the booking flow wants toasts, mount a separate `<Toaster />` somewhere in the customer tree.
- **Customer auth doesn't exist yet.** Booking stays guest-only — the `bookings` table has `customer_id uuid NULL`. When customer login lands later, attach existing guest bookings via email match (the RLS policy already does the right thing once `auth.email()` returns the same address).

## Working principles

- **Read before writing.** When asked to do a task, first summarise back what you understand and the steps you'll take. Don't write code until the human has confirmed.
- **Server components by default.** Add `"use client"` only when interactivity is needed.
- **Tailwind v4 utilities only.** Tokens live in `@theme` in `app/globals.css` and are referenced by name (`bg-brand-blue`, never `bg-[#2563EB]`). There is NO `tailwind.config.ts` — v4 is CSS-first.
- **Money is integer pence.** Never floats.
- **Update this HANDOFF when a task completes.** Mark what changed, what's the new "current task".

## Stack quirks worth knowing

- **Next 16** has deprecated `middleware.ts` in favour of `proxy.ts`. Renaming + updating the export name is a tiny follow-up but harmless to defer.
- **Tailwind v4** uses CSS-first config via `@theme { ... }` in `app/globals.css`. No `tailwind.config.ts` file.
- **`lucide-react` v1** dropped brand icons (Twitter/Instagram/LinkedIn). Hand-rolled SVGs live inline in `app/(customer)/_components/footer.tsx`.
- **`Icon` primitive** takes an `icon: LucideIcon` component prop, not a `name` string — preserves tree-shaking. Call sites: `import { Zap } from "lucide-react"; <Icon icon={Zap} />`.
- **Route groups + `tsc`**: bare `npx tsc --noEmit` reports a false-positive validator error because `.next/types/validator.ts` doesn't perfectly track route groups (looks for `app/page.tsx` when the page is at `app/(customer)/page.tsx`). `npm run build` passes cleanly — the build pipeline handles route groups correctly.
- **DVLA vs DVSA**: DVLA Vehicle Enquiry Service gives tax/MOT status but **not** the model. DVSA MOT History API gives the model (and full MOT history). We hit both in parallel and merge — see `app/actions/lookup-vehicle.ts`. Required env vars when running with real keys: `DVLA_API_KEY` (VES) plus `MOT_API_KEY` / `MOT_CLIENT_ID` / `MOT_CLIENT_SECRET` / `MOT_TOKEN_URL` / `MOT_SCOPE` (MOT). Missing either set falls back gracefully — DVLA to stub data, MOT to "no model".

## When in doubt

- For product / feature questions → check `00-working-brief.md`
- For "where does this file go" → check `01-architecture.md`
- For database / schema → check `02-data-model.md`
- For colours / spacing / component patterns → check `03-design-system.md`
- For step-by-step instructions on the current task → check the task doc
