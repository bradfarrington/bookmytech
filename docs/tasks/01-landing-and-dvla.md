# Task 01 — Landing page + DVLA lookup

**Status:** 🟡 Active

Build the customer-facing landing page at `/`, with a working reg-plate lookup powered by the DVLA Vehicle Enquiry Service.

## Why this task

The landing page is the first thing the business owner sees and the first thing real customers will see. It also forces us to nail the design system early — every screen built after this one inherits the tokens and component patterns established here.

## Goal

A fully built landing page (not just the hero) deployed to Vercel, with a working reg-plate input that returns real vehicle data from DVLA (or stub data while the API key is pending).

## Three sub-stages

The task is split into three sub-stages so progress is visible and reviewable. Don't skip ahead — each builds on the previous.

---

### Stage 1 — Encode design tokens

Update `tailwind.config.ts` with the brand tokens from `docs/03-design-system.md`. This is a small but critical step: every component built after this references these tokens by name, so getting them right once means no hard-coded hex values anywhere else in the codebase.

**Acceptance criteria:**

- [ ] `tailwind.config.ts` includes the `brand`, `surface`, `border`, `text`, `success`, `warning`, `danger`, `plate-yellow` colour tokens
- [ ] Inter font family wired (via `next/font` in `app/layout.tsx`)
- [ ] Custom `borderRadius.button`, `boxShadow.card`, `boxShadow.hero`, `backgroundImage.brand-gradient`, `maxWidth.content` are present
- [ ] A throwaway test page (e.g. `/style-test`) renders one of each colour to verify they work — delete this page once verified
- [ ] `npm run dev` shows no Tailwind errors in the terminal

**Files touched:**
- `tailwind.config.ts`
- `app/layout.tsx` (for the Inter font setup)

---

### Stage 2 — Extract UI components

The proposal JSX in `/proposal/` contains the landing page (and other screens) using inline styles. Extract the reusable primitives into `components/ui/`, converting inline styles to Tailwind utilities and the new tokens.

**Components to extract:**

- [ ] `Button` — `primary` / `secondary` / `ghost` variants, optional `iconLeft` / `iconRight`
- [ ] `Card` — white surface, `rounded-2xl`, `shadow-card`, `p-6` default
- [ ] `Pill` — tone variants (`blue` / `green` / `amber` / `red` / `dark`), optional `dot` prop
- [ ] `Icon` — wrapper around `lucide-react`, takes `name` / `size` / `color` / `className`
- [ ] `Avatar` — circular initials avatar, `size` and `tint` props
- [ ] `Stars` — rating display, `value` (0–5) and `size`
- [ ] `Overline` — small uppercase brand-blue eyebrow text
- [ ] `TrustBadge` — icon + value + label trio for the trust strip
- [ ] `RegPlateInput` — UK plate styling with GB badge, yellow background, monospace letters
- [ ] `CustomerNav` — top navigation, `active` and `dark` props

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

- [ ] All 10 components above live in `components/ui/` as individual files
- [ ] No inline `style={{ }}` props anywhere in `components/ui/`
- [ ] No hard-coded hex colours anywhere in `components/ui/`
- [ ] `lib/utils.ts` exists with `cn()` helper
- [ ] Each component is importable via `@/components/ui/<name>` (no barrel exports needed yet — keep it explicit)

**Files touched:**
- `components/ui/*.tsx` (10 new files)
- `lib/utils.ts`

---

### Stage 3 — Build the landing page

Port the landing page mockup into `app/(customer)/page.tsx`, using the components from Stage 2 and the tokens from Stage 1. Build it out to the **full** landing page — the proposal JSX only shows the hero, trust strip, "how it works" and reviews. We need to extend it with more sections to make it a real, conversion-focused page.

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

- [ ] `lib/dvla/client.ts` — wraps the POST request to `https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles` with the `x-api-key` header and a `{ registrationNumber: string }` body
- [ ] `lib/dvla/types.ts` — TypeScript type for the response (`VehicleDetails` with `make`, `model`, `colour`, `fuelType`, `yearOfManufacture`, `engineCapacity`, `motStatus`, `motExpiryDate`, `taxStatus`, `taxDueDate`, `co2Emissions`)
- [ ] **Stub mode** — if `process.env.DVLA_API_KEY` is empty, return canned data for a small set of regs (`LB21 XYZ`, `AB12 CDE`, `XY99 ZZZ`) and a `vehicleNotFound`-style response for anything else. This lets the UI be built fully without waiting on the key.
- [ ] The reg-plate input on the hero (and on the final CTA strip) submits the reg via a server action, fetches DVLA data, and on success redirects to `/book?reg=<reg>` (the booking flow doesn't exist yet — for now, render the result in a small "we found your car" card below the input on the landing page itself, just to prove the integration works end-to-end)
- [ ] Validate UK reg format client-side with `zod` before submitting (regex like `/^[A-Z0-9]{2,3} ?[A-Z0-9]{3,4}$/i`, normalised to uppercase with single space)

**The live mechanic preview card** in the hero — this is currently hard-coded in the JSX with three mechanics. Keep it hard-coded as seed data for this task. When mechanics actually exist in the system (much later task), this will be replaced with a real query.

**Mobile considerations:**

- The hero is two-column on desktop, single-column stacked on mobile. The right-side mechanic card moves below the hero copy on mobile.
- The trust strip is a four-column grid on desktop, two-column on mobile, single-column on small mobile.
- The "how it works" four-card grid becomes two-column on tablet, single-column on mobile.
- All paddings reduce on mobile (the desktop `padding: 56px 32px` becomes `px-4 py-8` on mobile, scaling up at `md:` and `lg:` breakpoints)
- Test at 375px width before considering this stage done.

**Acceptance criteria:**

- [ ] `app/(customer)/page.tsx` renders the full landing page (all 9 sections above)
- [ ] All sections built using `components/ui/` primitives — no inline styles, no hard-coded hex
- [ ] Hero reg-plate input validates UK format and submits via server action
- [ ] DVLA lookup works (real key or stub mode) and returns vehicle data
- [ ] Successful lookup shows a "we found your car" card with make / model / year
- [ ] Services preview pulls from the `services` table (seeded fallback if empty)
- [ ] FAQ accordion expands/collapses (client component)
- [ ] Final CTA reg-plate input behaves the same as the hero one (extract to a shared component if there's duplication)
- [ ] Footer renders with the three link columns
- [ ] Page is fully responsive — verified at 375px, 768px, 1280px widths
- [ ] No console errors in the browser
- [ ] Lighthouse score: performance ≥ 85, accessibility ≥ 95 (run in Chrome DevTools)
- [ ] Deployed to Vercel and the live URL renders correctly

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
