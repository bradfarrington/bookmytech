# Task 01 — Landing page + DVLA lookup

**Status:** ✅ Complete (landing page + DVLA lookup both shipped — see "DVLA wiring — closed" below)

Build the customer-facing landing page at `/`, with a working reg-plate lookup powered by the DVLA Vehicle Enquiry Service.

## DVLA wiring — closed

The carve-out has been closed. The reg-plate form is live end-to-end:

- `lib/dvla/types.ts` — `VehicleDetails` + `LookupResult` discriminated union (`not_found` / `invalid_reg` / `rate_limited` / `unknown`).
- `lib/dvla/client.ts` — POSTs to the DVLA VES endpoint with `x-api-key`, returns canned stub data for `LB21 XYZ` / `AB12 CDE` / `XY99 ZZZ` when `DVLA_API_KEY` is empty.
- `lib/dvla/mot-client.ts` — **added beyond the original spec.** DVLA VES doesn't return `model`, so we also call the DVSA MOT History API (OAuth2 client-credentials, module-level token cache) and merge `model` onto the VES response. Best-effort: a MOT failure never blocks the primary lookup.
- `app/actions/lookup-vehicle.ts` — server action that normalises the reg, validates with the UK plate regex, then runs DVLA VES + MOT lookup in parallel via `Promise.all`.
- `app/(customer)/_components/vehicle-lookup-modal.tsx` — renders the real `VehicleDetails` (make/model/year, colour pill, fuel, engine, MOT + tax with tone-coded pills and expiry dates).

Deviations from the original Stage 3 spec:

- **`useTransition` instead of `useActionState`** — `reg-lookup-form.tsx` uses `useTransition` + local `useState` because we want the modal open immediately in `loading` state, then to update in place as the result arrives. `useActionState`'s pending → result flow doesn't model that cleanly.
- **Modal instead of inline "we found your car" card** — the spec said render a card below the input; we render a `<dialog>` modal that echoes reg + postcode and shows the result. Same goal, better UX.
- **No `/book?reg=…` redirect yet** — the modal's "Continue to booking" button is wired to `onClose` for now. Real redirect lands when the booking flow (task 02/03) exists.
- **Env vars needed for live mode:** `DVLA_API_KEY` (VES), plus `MOT_API_KEY` / `MOT_CLIENT_ID` / `MOT_CLIENT_SECRET` / `MOT_TOKEN_URL` / `MOT_SCOPE` (MOT History). Missing either set falls back gracefully — DVLA to stub data, MOT to "no model".

## Why this task

The landing page is the first thing the business owner sees and the first thing real customers will see. It also forces us to nail the design system early — every screen built after this one inherits the tokens and component patterns established here.

## Goal

A fully built landing page (not just the hero) deployed to Vercel, with a working reg-plate input that returns real vehicle data from DVLA (or stub data while the API key is pending).

## Three sub-stages

The task is split into three sub-stages so progress is visible and reviewable. Don't skip ahead — each builds on the previous.

---

### Stage 1 — Encode design tokens ✅

Tokens encoded in `app/globals.css` via Tailwind v4's `@theme { ... }` block (NOT `tailwind.config.ts` — the project uses Tailwind v4, which is CSS-first). See `docs/03-design-system.md` for the full block.

**Acceptance criteria:**

- [x] Colour tokens (`brand`, `surface`, `border`, `text`, `success`, `warning`, `danger`, `plate-yellow`) encoded in `app/globals.css` via Tailwind v4 `@theme` (not `tailwind.config.ts` — see note above)
- [x] Inter font family wired (via `next/font` in `app/layout.tsx`)
- [x] Custom `borderRadius.button`, `boxShadow.card`, `boxShadow.hero`, `backgroundImage.brand-gradient`, `maxWidth.content` are present
- [x] Throwaway style test page used during build and removed before shipping
- [x] `npm run dev` shows no Tailwind errors in the terminal

**Files touched:**
- `tailwind.config.ts`
- `app/layout.tsx` (for the Inter font setup)

---

### Stage 2 — Extract UI components ✅

10 primitives shipped in `components/ui/`: `button.tsx`, `card.tsx`, `pill.tsx`, `icon.tsx`, `avatar.tsx`, `stars.tsx`, `overline.tsx`, `trust-badge.tsx`, `reg-plate-input.tsx`, `customer-nav.tsx`. `cn()` helper plus `normaliseReg()` and `formatPrice()` in `lib/utils.ts`.

Deviations from the original spec:
- `Icon` takes `icon: LucideIcon` (component prop) instead of `name: string`, preserving tree-shaking.
- `Overline` defaults to `text-muted` slate per the proposal (the original spec said brand-blue; section eyebrows that want brand-blue pass `className="text-brand-blue"`).
- `Avatar` uses inline `style` for runtime-dynamic `size`/`fontSize` — unavoidable since Tailwind can't compile dynamic numeric values to utilities.

The proposal JSX in `/proposal/` is preserved as the visual reference; the Tailwind components are the canonical implementations.

**Components to extract:**

- [x] `Button` — `primary` / `secondary` / `ghost` variants, optional `iconLeft` / `iconRight`
- [x] `Card` — white surface, `rounded-2xl`, `shadow-card`, `p-6` default
- [x] `Pill` — tone variants, optional `dot` prop
- [x] `Icon` — wrapper around `lucide-react` (takes `icon: LucideIcon` component prop, not `name: string` — preserves tree-shaking)
- [x] `Avatar` — circular initials avatar, `size` and `tint` props
- [x] `Stars` — rating display, `value` (0–5) and `size`
- [x] `Overline` — small uppercase eyebrow text (defaults to `text-muted`; pass `className="text-brand-blue"` for brand-blue)
- [x] `TrustBadge` — icon + value + label trio for the trust strip
- [x] `RegPlateInput` — UK plate styling with GB badge, yellow background, monospace letters
- [x] `CustomerNav` — top navigation, `active` and `dark` props

**Conventions while extracting:**

- One component per file, kebab-case filename (`button.tsx`, `reg-plate-input.tsx`)
- Each component exports a named export (`export function Button(...)`) plus a `ButtonProps` type
- Use `cva` (class-variance-authority) for variant-heavy components like `Button` and `Pill`
- Use the `cn()` helper from `lib/utils.ts` for conditional class merging — create it if it doesn't exist:
  ```ts
  // lib/utils.ts
  import { type ClassValue, clsx } from "clsx";
  import { twMerge } from "tailwind-merge";

  export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
  }
  ```
- Reference design tokens by name (`bg-brand-blue`, not `bg-[#2563EB]`)
- Components are server components by default — only add `"use client"` if they need interactivity (e.g. a button with an `onClick` is fine staying server-side if it's just being rendered; only client when state/handlers attach to it)

**Acceptance criteria:**

- [x] All 10 components live in `components/ui/` as individual files
- [x] No hard-coded hex colours anywhere in `components/ui/`
- [x] `lib/utils.ts` exists with `cn()` helper (plus `normaliseReg()` and `formatPrice()`)
- [x] Each component is importable via `@/components/ui/<name>` (no barrel exports)
- [~] No inline `style={{ }}` — exception: `Avatar` uses inline `style` for runtime-dynamic `size`/`fontSize`, since Tailwind can't compile dynamic numeric values to utilities

**Files touched:**
- `components/ui/*.tsx` (10 new files)
- `lib/utils.ts`

---

### Stage 3 — Build the landing page ✅

All 9 sections shipped at `app/(customer)/page.tsx`, composed from `app/(customer)/_components/*`. DVLA wiring is now live — see "DVLA wiring — closed" section at the top of this doc for what shipped and the deviations from the original spec.

**Sections to build (in order, top to bottom):**

1. **Hero** (from proposal JSX) — dark gradient background, two-column layout, headline + reg-plate input on the left, live mechanic preview card on the right
2. **Trust strip** (from proposal JSX) — four trust badges on white background
3. **How it works** (from proposal JSX) — four-step cards with numbered overlines
4. **Reviews** (from proposal JSX) — three customer testimonial cards
5. **NEW: Services preview** — a 6-card grid showing the service categories from the brief (Full Service, Diagnostic, Brakes & Tyres, Battery, Clutch & Gears, MOT Pre-check) with starting prices. Pulls from the `services` table in Supabase (server component, fetched at request time). If the table is empty, render seed data and add a note in the code that this should be replaced once admin services CRUD is built.
6. **NEW: Why BMT** — a section explaining the BMT difference: vetted mechanics, transparent pricing, comes to you, 12-month guarantee. Use a two-column layout with icons and short copy.
7. **NEW: FAQ** — 5-6 common questions in an accordion (e.g. "How are mechanics vetted?", "What if I'm not happy with the work?", "Do I pay upfront?"). Use a client component for the accordion interaction.
8. **NEW: Final CTA strip** — gradient blue band before the footer with "Ready to book?" copy and another reg-plate input. Echoes the hero CTA so users scrolling all the way down don't have to scroll back up.
9. **NEW: Footer** — three columns (For Customers / For Mechanics / Company), with links (most can be `#` placeholders for now), plus social links and a copyright line. Dark background.

**DVLA wiring:**

- [x] `lib/dvla/client.ts` — POSTs `{ registrationNumber }` to the DVLA VES endpoint with `x-api-key`, maps 400/404/429 to typed error codes
- [x] `lib/dvla/types.ts` — `VehicleDetails` (`make`, `model?`, `colour?`, `fuelType?`, `yearOfManufacture?`, `engineCapacity?`, `motStatus?`, `motExpiryDate?`, `taxStatus?`, `taxDueDate?`, `co2Emissions?`) + `LookupResult` discriminated union
- [x] **Stub mode** — when `DVLA_API_KEY` is empty, returns canned data for `LB21 XYZ` / `AB12 CDE` / `XY99 ZZZ` and a `not_found` result for anything else
- [x] `app/actions/lookup-vehicle.ts` — server action validates the UK plate regex, runs DVLA VES + MOT lookup in parallel via `Promise.all`, merges `model` from MOT onto the VES response
- [x] **Bonus — MOT History API integration** (`lib/dvla/mot-client.ts`): OAuth2 client-credentials with module-level token cache (refreshes ~60s before expiry), supplies the `model` field DVLA VES doesn't return
- [x] Plate validation via regex (`/^[A-Z0-9]{2,3} ?[A-Z0-9]{3,4}$/i`) plus `normaliseReg()` — `zod` not needed for a single-field shape
- [x] Hero + final-CTA reg inputs both submit through the same `RegLookupForm` component, which calls the server action and opens the result modal
- [x] `/book?reg=<reg>` redirect on success — wired in Task 03: the modal's "Continue to booking" button (`onContinue`) routes to `/book/vehicle?reg=<reg>&postcode=<postcode>`

**The live mechanic preview card** in the hero — this is currently hard-coded in the JSX with three mechanics. Keep it hard-coded as seed data for this task. When mechanics actually exist in the system (much later task), this will be replaced with a real query.

**Mobile considerations:**

- The hero is two-column on desktop, single-column stacked on mobile. The right-side mechanic card moves below the hero copy on mobile.
- The trust strip is a four-column grid on desktop, two-column on mobile, single-column on small mobile.
- The "how it works" four-card grid becomes two-column on tablet, single-column on mobile.
- All paddings reduce on mobile (the desktop `padding: 56px 32px` becomes `px-4 py-8` on mobile, scaling up at `md:` and `lg:` breakpoints)
- Test at 375px width before considering this stage done.

**Acceptance criteria:**

- [x] `app/(customer)/page.tsx` renders the full landing page (all 9 sections above)
- [x] All sections built using `components/ui/` primitives — no hard-coded hex
- [x] Hero reg-plate input validates UK format and submits via server action
- [x] DVLA lookup works (real key or stub mode) and returns vehicle data
- [x] Successful lookup shows a "we found your car" view with make / model / year (rendered in a modal — see deviation note above)
- [x] Services preview pulls from the `services` table (seeded fallback if empty)
- [x] FAQ accordion expands/collapses (client component)
- [x] Final CTA reg-plate input shares the hero's behaviour via the `RegLookupForm` component
- [x] Footer renders with the three link columns
- [x] Page is fully responsive — verified at 375px, 768px, 1280px widths (mobile/tablet pass confirmed in commit `ac0afe7`)
- [ ] No console errors in the browser — not re-verified since DVLA wiring landed
- [ ] Lighthouse score: performance ≥ 85, accessibility ≥ 95 — not re-run since DVLA wiring landed
- [ ] Deployed to Vercel and the live URL renders correctly — not verified in this update

**Files touched:**
- `app/(customer)/page.tsx`
- `app/(customer)/_components/` (page-specific composite components — hero, services-preview, faq, etc. — that aren't generic enough to live in `components/ui/`)
- `app/actions/lookup-vehicle.ts` (server action)
- `lib/dvla/client.ts`, `lib/dvla/types.ts`
- `.env.local` (add `DVLA_API_KEY` when available)

## What NOT to do in this task

- Don't build the booking flow (`/book`) — that's task 02 (or 03 — see plan in HANDOFF)
- Don't build any auth / login screens
- Don't seed the `services` table from this task — admin services CRUD will do that. Just use a fallback array if the table is empty.
- Don't add Stripe, Google Maps, Twilio, or Resend — none of those are needed for a landing page
- Don't over-engineer the FAQ accordion — a simple `useState` is fine. No need for `@radix-ui/react-accordion` unless you want to.

## When complete

- Update `docs/HANDOFF.md`:
  - Mark task 01 as ✅ Complete in the "What's done" section
  - Set "Current task" to whatever's next
- Commit and push. Vercel auto-deploys. Send the business owner the URL.
