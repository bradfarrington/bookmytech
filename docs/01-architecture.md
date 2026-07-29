# Architecture

This doc defines the codebase structure, conventions and patterns for Book My Tech. Any Claude session working on this project should read this before writing code.

## Stack

- **Framework:** Next.js 16 (App Router, TypeScript, Turbopack)
- **Runtime:** React 19
- **Styling:** Tailwind CSS v4 — CSS-first config via `@theme { ... }` in `app/globals.css`. There is NO `tailwind.config.ts`.
- **Database & Auth:** Supabase (Postgres, Auth, Realtime, Storage)
- **Hosting:** Vercel (three projects, one repo — customer / mechanic / admin subdomains)
- **Payments:** Stripe Connect (added at booking-flow task)
- **External APIs:** DVLA Vehicle Enquiry Service, Google Maps Platform, Resend, Twilio

## One codebase, three deploys

This is **one Next.js codebase** deployed to **three separate Vercel projects**, each pointing at the same GitHub repo, each serving a different subdomain:

- `bookmytech.co.uk` → customer routes only
- `mechanic.bookmytech.co.uk` → mechanic routes only
- `admin.bookmytech.co.uk` → admin routes only

This gives separate deploys (you can deploy customer changes without touching admin) while sharing one schema, one design system, and one set of types. Schema changes are atomic — one commit updates all three apps in lockstep.

For now, only one Vercel project exists. The second and third are added when the mechanic and admin sections become substantial enough to warrant their own domains.

## Two clients, one backend

This repo is no longer only a web app. A **customer mobile app** (React Native /
Expo, separate repo `bmt-customer-app`) shares this database, this business
logic and these integrations. There are now two clients:

| | Web app (this repo's pages) | Mobile app (`bmt-customer-app`) |
|---|---|---|
| Entry point | Server Actions in `app/actions/` | HTTP route handlers in `app/api/mobile/v1/` |
| Auth | Supabase **cookie** session (`lib/supabase/server.ts`) | `Authorization: Bearer <access token>` (`lib/supabase/mobile.ts`) |
| Reads | Server components read via the cookie client | Route handlers, plus **direct Supabase reads under the existing customer RLS policies** |
| Responses | HTML, `redirect()` | JSON only — **never a redirect**, the app cannot follow one |
| Updating | A deploy puts everyone on the new version at once | Old builds stay on phones for months |

**Business logic lives in one place and both clients call it.** The app must
never reimplement pricing, dispatch or notifications — a route handler is a thin
wrapper over `lib/` and `app/actions/`. Where an action isn't callable from a
route handler (it takes `FormData`, or ends in `redirect()`), the fix is to
extract its core into a plain async function that both callers use. That is why
`lib/customers/provision.ts` exists: `createCustomerAccount()` is called by the
web Server Action, the booking funnel *and* the mobile signup route, so an
account has the same shape however it was made. Copying logic instead would let
the two clients drift.

The consequence that shapes everything else: **a shipped API path, response
shape or field name is a contract**, because a phone running last month's build
still calls it. Additive changes are safe; renames, removals and changed
semantics are not. The standing rules — including when to tell Brad a change
needs work in the app repo — live in `AGENTS.md`; the build itself is
`docs/tasks/18-mobile-api.md`.

Note this is the one sanctioned exception to "don't add a separate REST API
layer" below: it exists solely because a native client cannot call Server
Actions. Web features still use Server Actions.

## Folder structure

```
bookmytech/
├── app/
│   ├── globals.css                # @import "tailwindcss" + @theme tokens
│   ├── layout.tsx                 # root layout, Inter font, metadata
│   ├── (customer)/                # customer routes — no URL prefix
│   │   ├── page.tsx               # → /  (landing page)
│   │   ├── _components/           # page-specific composites (hero, faq, footer, etc.)
│   │   ├── book/                  # → /book  (booking flow — not yet built)
│   │   └── dashboard/             # → /dashboard (not yet built)
│   ├── (mechanic)/
│   │   └── mechanic/              # → /mechanic/*
│   │       ├── jobs/
│   │       ├── schedule/
│   │       └── earnings/
│   ├── (admin)/
│   │   └── admin/                 # → /admin/*
│   │       ├── services/
│   │       ├── bookings/
│   │       └── approvals/
│   ├── actions/                   # server actions (e.g. lookup-vehicle.ts when DVLA lands)
│   └── api/                       # API routes (rare — prefer server actions)
│       ├── cron/                  # Vercel cron endpoints (CRON_SECRET-gated)
│       ├── webhooks/              # Stripe / GoCardless receivers
│       └── mobile/v1/             # the mobile app's HTTP contract — Bearer auth, JSON only
├── components/
│   ├── ui/                        # design-system primitives (Button, Card, Pill, Icon, etc.)
│   ├── customer/                  # cross-page customer composites (if any — page-local stays in (customer)/_components)
│   ├── mechanic/                  # mechanic-specific
│   └── admin/                     # admin-specific
├── lib/
│   ├── supabase/                  # client.ts (browser), server.ts (cookies), admin.ts (service-role), mobile.ts (Bearer)
│   ├── dvla/                      # API wrapper (added when DVLA key lands)
│   ├── stripe/                    # added later
│   └── utils.ts                   # cn(), normaliseReg(), formatPrice(), etc.
├── public/                        # static assets (logo.png, favicon, etc.)
├── docs/                          # this folder — project documentation
│   ├── 00-working-brief.md
│   ├── 01-architecture.md
│   ├── 02-data-model.md
│   ├── 03-design-system.md
│   ├── HANDOFF.md
│   └── tasks/
└── middleware.ts                  # Supabase auth refresh (deprecated in Next 16; rename to proxy.ts when convenient)
```

## Conventions

**Route groups (the parentheses).** `(customer)`, `(mechanic)`, `(admin)` are Next.js route groups — the folder name in parentheses does NOT appear in the URL. They exist to scope each role's pages and allow per-section layouts. `app/(customer)/page.tsx` is the root URL `/`.

**Server components by default.** Every component is a server component unless it needs interactivity. Add `"use client"` at the top of a file ONLY when it uses hooks (`useState`, `useEffect`), event handlers (`onClick`), or browser APIs.

**Data fetching pattern.** Server components fetch data directly via `lib/supabase/server.ts`. Client components either receive data as props from a server parent, or use server actions for mutations. Avoid `useEffect` for data fetching.

**File naming.** kebab-case for files (`reg-plate-input.tsx`), PascalCase for component names inside (`export function RegPlateInput`). Pages are always `page.tsx`, layouts are `layout.tsx`.

**Imports.** Use the `@/*` alias for absolute imports (`@/components/ui/button` not `../../components/ui/button`).

**Styling.** Tailwind v4 utilities only. No inline styles (except for runtime-dynamic values like avatar `size` that can't be expressed as static classes), no CSS modules, no styled-components. Design tokens (colours, spacing, radii) live in the `@theme { ... }` block of `app/globals.css` and are referenced by name (`bg-brand-blue` not `bg-[#2563EB]`).

**Tailwind v4 specifics.** v4 reads CSS variables under the `@theme` block to derive utility classes. A `--color-brand-blue` token emits `bg-brand-blue` / `text-brand-blue` / `border-brand-blue` utilities. `--shadow-card` → `shadow-card`. `--radius-button` → `rounded-button`. `--container-content` → `max-w-content`. `--background-image-brand-gradient` → `bg-brand-gradient`. There is NO `tailwind.config.ts` — adding one will be ignored.

**Money is integer pence.** Never floats, never `numeric`. `£45.99` is stored as `4599`. Format for display with a helper.

**No client-side data-fetching libraries.** Don't add SWR, React Query, or tRPC. Next.js server components plus server actions cover every use case in this app.

## What NOT to do

- Don't add a separate REST/GraphQL API layer for **web** features — use server actions. The one exception is `app/api/mobile/v1/**`, which exists because a native client can't call Server Actions (see "Two clients, one backend")
- Don't use `lib/supabase/server.ts` from a mobile route handler — it derives auth from cookies the app never sends, and the caller silently comes back `null`
- Don't add Redux, Zustand, or any global state library — URL state + React state handles this
- Don't add `react-router-dom` — Next has its own router
- Don't put secrets in code or in `NEXT_PUBLIC_*` env vars — those ship to the browser
- Don't bypass RLS by using the service-role key client-side. Service-role is server-only.
- Don't write inline styles — use Tailwind utilities and design-system components (exception: runtime-dynamic numeric values like avatar `size` that can't be Tailwind utilities)
- Don't hard-code colours, spacing, or radii — reference the design tokens
- Don't add a `tailwind.config.ts` — v4 is CSS-first and will ignore it. Add tokens to `@theme` in `app/globals.css` instead.

## Adding a new feature

1. Read `00-working-brief.md` for the product context
2. Read the relevant task doc in `docs/tasks/`
3. Check `02-data-model.md` to see if you need schema changes
4. Check `03-design-system.md` for tokens and component patterns
5. Build server-first, add client interactivity only where needed
6. Update `HANDOFF.md` when the task is complete
