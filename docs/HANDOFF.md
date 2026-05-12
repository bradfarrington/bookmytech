# HANDOFF — Claude, read this first

You are working on **Book My Tech**, a UK mobile-mechanic booking platform. This document tells you where the project stands right now and what to work on next.

## Read these in order before doing anything else

1. **`docs/00-working-brief.md`** — the full product spec. The source of truth for what we're building and why.
2. **`docs/01-architecture.md`** — codebase structure, conventions, and what NOT to do.
3. **`docs/02-data-model.md`** — current Supabase schema and patterns.
4. **`docs/03-design-system.md`** — brand tokens, Tailwind config, component patterns.
5. **The currently active task in `docs/tasks/`** — see "Current task" below.

## Project state

**Stack:** Next.js 15 (App Router, TypeScript) · Tailwind · Supabase · Vercel · `@/*` import alias

**What's done:**
- Foundation complete (`docs/tasks/00-foundation.md`)
- Next.js project scaffolded with Tailwind, TypeScript, App Router
- Supabase project provisioned, three tables created (`profiles`, `services`, `bookings`), RLS enabled
- Supabase clients wired (`lib/supabase/client.ts`, `lib/supabase/server.ts`)
- Auth middleware in place (`middleware.ts`) — no login screens yet, just the plumbing
- Route groups created: `app/(customer)/`, `app/(mechanic)/`, `app/(admin)/`
- Admin user exists in Supabase (manually promoted via SQL)
- Repo on GitHub, deployed to Vercel
- Proposal JSX mockups added to `/proposal/` for reference

**What's not done:**
- No real UI yet — the default Next.js placeholder still renders at `/`
- Design tokens not yet encoded in `tailwind.config.ts`
- No UI components extracted from the proposal JSX
- DVLA API access pending (business owner is applying — use the stub until the key arrives)

## Current task

**`docs/tasks/01-landing-and-dvla.md`** — Build the landing page and wire it up to the DVLA Vehicle Enquiry Service.

This task is broken into three sub-stages so progress is visible:

1. **Encode design tokens** — update `tailwind.config.ts` with the brand tokens from `03-design-system.md`.
2. **Extract UI components** — pull `Button`, `Card`, `Pill`, `Icon`, `Avatar`, `Stars`, `Overline`, `TrustBadge`, `RegPlateInput`, `CustomerNav` from the proposal JSX into `components/ui/`, converting inline styles to Tailwind.
3. **Build the landing page** — port the landing page JSX in `app/(customer)/page.tsx` using the new components. Wire the reg-plate input to the DVLA API (stubbed until the real key lands). Build out the full landing page — not just the hero — including the live mechanic preview, trust strip, "how it works", and reviews sections.

## Working principles

- **Read before writing.** When asked to do a task, first summarise back what you understand and the steps you'll take. Don't write code until the human has confirmed.
- **Server components by default.** Add `"use client"` only when interactivity is needed.
- **Tailwind only, no inline styles.** Convert any inline styles you encounter during ports.
- **Design tokens by name.** Use `bg-brand-blue`, never `bg-[#2563EB]`.
- **Money is integer pence.** Never floats.
- **Update this HANDOFF when a task completes.** Mark what changed, what's the new "current task".

## When in doubt

- For product / feature questions → check `00-working-brief.md`
- For "where does this file go" → check `01-architecture.md`
- For database / schema → check `02-data-model.md`
- For colours / spacing / component patterns → check `03-design-system.md`
- For step-by-step instructions on the current task → check the task doc
