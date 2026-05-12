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
- **Task 01 complete** (`docs/tasks/01-landing-and-dvla.md`)
  - Design tokens encoded in `app/globals.css` via Tailwind v4 `@theme` (brand colours, surfaces, borders, text scale, radii, shadows, gradient, max-width)
  - Inter wired via `next/font/google` in `app/layout.tsx`
  - 10 UI primitives extracted to `components/ui/`: `Button`, `Card`, `Pill`, `Icon`, `Avatar`, `Stars`, `Overline`, `TrustBadge`, `RegPlateInput`, `CustomerNav`
  - `cn()` helper + `normaliseReg()` + `formatPrice()` in `lib/utils.ts`
  - Full landing page at `/` — 9 sections: hero, trust strip, how-it-works, reviews, services preview, why BMT, FAQ, final CTA, footer
  - Page-specific composites in `app/(customer)/_components/`
  - Reg-plate lookup form (hero + final CTA, shared component) — opens a `<dialog>` modal on submit
  - Services preview pulls from the `services` Supabase table with a seeded fallback (table currently empty)
  - Production build passes; `/` serves as a dynamic SSR route due to the Supabase read

**What's not done:**
- **DVLA wiring** — deferred until the API key arrives. The form is fully functional UI; submit opens a "Lookup coming soon" modal. When the key lands, the next task is to:
  1. Add `lib/dvla/{client,types}.ts` and `app/actions/lookup-vehicle.ts` (stub mode for missing key)
  2. Swap the placeholder body in `vehicle-lookup-modal.tsx` for the real `VehicleDetails` render
  3. Wire `reg-lookup-form.tsx` to call the server action via `useActionState`
- **`/book` flow** — task 02. Customer booking steps 1–4 from the mobile mockups.
- **Auth / login screens** — task 03 (or wherever it fits).
- **Admin services CRUD** — when this ships, the seeded fallback in `services-preview.tsx` becomes dead code and the table gets a populated default catalogue.
- **Tablet (768px) and mobile (375px) polish** — desktop (1280px) looks right; the 768/375 layouts work but need design tweaks (spacing, type scale, the hero stack, the modal sizing). Owner flagged this on the task 01 commit; treat as a follow-up before going further on customer-facing pages.

## Current task

**Next: DVLA wiring + `/book` flow.** Likely split across two task docs once the API key situation is resolved. The DVLA work is small (one types file, one client file, one server action, one modal-body swap) and can land before the booking flow begins.

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

## When in doubt

- For product / feature questions → check `00-working-brief.md`
- For "where does this file go" → check `01-architecture.md`
- For database / schema → check `02-data-model.md`
- For colours / spacing / component patterns → check `03-design-system.md`
- For step-by-step instructions on the current task → check the task doc
