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
- ✅ Task 00 — Foundation complete (`docs/tasks/00-foundation.md`)
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

## Full task roadmap

The platform is built across 13 tasks (00–12). They're sequenced — each generally depends on what came before, though stages within tasks can sometimes run in parallel.

| #  | Task | File | Status |
|----|------|------|--------|
| 00 | Foundation — Next.js scaffold, Supabase, route groups | `tasks/00-foundation.md` | ✅ Complete |
| 01 | Landing page + DVLA lookup | `tasks/01-landing-and-dvla.md` | 🟡 Active |
| 02 | Admin shell + services catalogue CRUD | `tasks/02-admin-services.md` | ⏳ Queued |
| 03 | Customer booking flow (4 steps + Stripe pre-auth) | `tasks/03-booking-flow.md` | ⏳ Queued |
| 04 | Admin live monitor + manual mechanic creation | `tasks/04-admin-live-monitor.md` | ⏳ Queued |
| 05 | Mechanic desktop dashboard | `tasks/05-mechanic-dashboard.md` | ⏳ Queued |
| 06 | Mechanic mobile PWA (field work, push notifications) | `tasks/06-mechanic-mobile-pwa.md` | ⏳ Queued |
| 07 | Mechanic onboarding + admin approvals queue | `tasks/07-mechanic-onboarding.md` | ⏳ Queued |
| 08 | Pricing engine + Stripe Connect payouts | `tasks/08-pricing-and-stripe-connect.md` | ⏳ Queued |
| 09 | Customer dashboard + live tracking + smart dispatch | `tasks/09-customer-dashboard-tracking-dispatch.md` | ⏳ Queued |
| 10 | Analytics + parts margin + multi-city tooling | `tasks/10-analytics-parts-multi-city.md` | ⏳ Queued |
| 11 | Retention: rebooking, reminders, Pro tier, referrals | `tasks/11-retention-rebooking-pro-tier.md` | ⏳ Queued |
| 12 | Disputes, refunds, polish, launch | `tasks/12-disputes-polish-launch.md` | ⏳ Queued |

When a task completes, update its row to ✅ and update the "Current task" pointer above.

## Working principles

- **Read before writing.** When asked to do a task, first summarise back what you understand and the steps you'll take. Don't write code until the human has confirmed.
- **Stage by stage.** Each task is split into sub-stages. Work one stage at a time, show your output, get sign-off, then move on. Don't skip ahead.
- **Server components by default.** Add `"use client"` only when interactivity is needed.
- **Tailwind only, no inline styles.** Convert any inline styles you encounter during ports.
- **Design tokens by name.** Use `bg-brand-blue`, never `bg-[#2563EB]`.
- **Money is integer pence.** Never floats.
- **Database changes go in a migration file.** Even if you run them via the Supabase dashboard, the SQL gets committed in `supabase/migrations/`.
- **Update this HANDOFF when a task completes.** Mark what changed, what's the new "current task".
- **Commit often.** Small focused commits beat big sweeping ones. Use clear messages: "Task 01 Stage 2: extract Button, Card, Pill components".

## When in doubt

- For product / feature questions → check `00-working-brief.md`
- For "where does this file go" → check `01-architecture.md`
- For database / schema → check `02-data-model.md`
- For colours / spacing / component patterns → check `03-design-system.md`
- For step-by-step instructions on the current task → check the task doc
- For what's been done previously → look at git log and previously-completed task docs

## Non-obvious things to remember

- This is **one codebase, three Vercel deploys**. Don't suggest splitting into multiple repos.
- The mechanic mobile experience is a **PWA**, not a native app. Don't suggest React Native unless explicitly asked.
- The brief is the source of truth for product behaviour. If a task doc contradicts the brief, the brief wins — flag the discrepancy.
- The owner is moving fast and not following weekly timelines from the brief — tasks are done at the owner's own pace.
