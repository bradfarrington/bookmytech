# Architecture

This doc defines the codebase structure, conventions and patterns for Book My Tech. Any Claude session working on this project should read this before writing code.

## Stack

- **Framework:** Next.js 15 (App Router, TypeScript)
- **Styling:** Tailwind CSS with design tokens in `tailwind.config.ts`
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

## Folder structure

```
bookmytech/
├── app/
│   ├── (customer)/                # customer routes — no URL prefix
│   │   ├── page.tsx               # → /  (landing page)
│   │   ├── book/                  # → /book  (booking flow)
│   │   └── dashboard/             # → /dashboard
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
│   └── api/                       # API routes (rare — prefer server actions)
├── components/
│   ├── ui/                        # design-system primitives (Button, Card, Input, Pill, Icon)
│   ├── customer/                  # customer-specific composite components
│   ├── mechanic/                  # mechanic-specific
│   └── admin/                     # admin-specific
├── lib/
│   ├── supabase/                  # client.ts, server.ts
│   ├── dvla/                      # API wrapper
│   ├── stripe/                    # added later
│   └── utils.ts                   # cn() helper, formatters
├── docs/                          # this folder — project documentation
│   ├── 00-working-brief.md
│   ├── 01-architecture.md
│   ├── 02-data-model.md
│   ├── 03-design-system.md
│   ├── HANDOFF.md
│   └── tasks/
└── middleware.ts                  # Supabase auth refresh
```

## Conventions

**Route groups (the parentheses).** `(customer)`, `(mechanic)`, `(admin)` are Next.js route groups — the folder name in parentheses does NOT appear in the URL. They exist to scope each role's pages and allow per-section layouts. `app/(customer)/page.tsx` is the root URL `/`.

**Server components by default.** Every component is a server component unless it needs interactivity. Add `"use client"` at the top of a file ONLY when it uses hooks (`useState`, `useEffect`), event handlers (`onClick`), or browser APIs.

**Data fetching pattern.** Server components fetch data directly via `lib/supabase/server.ts`. Client components either receive data as props from a server parent, or use server actions for mutations. Avoid `useEffect` for data fetching.

**File naming.** kebab-case for files (`reg-plate-input.tsx`), PascalCase for component names inside (`export function RegPlateInput`). Pages are always `page.tsx`, layouts are `layout.tsx`.

**Imports.** Use the `@/*` alias for absolute imports (`@/components/ui/button` not `../../components/ui/button`).

**Styling.** Tailwind utilities only. No inline styles, no CSS modules, no styled-components. Design tokens (colours, spacing, radii) live in `tailwind.config.ts` and are referenced by name (`bg-brand-blue` not `bg-[#2563EB]`).

**Money is integer pence.** Never floats, never `numeric`. `£45.99` is stored as `4599`. Format for display with a helper.

**No client-side data-fetching libraries.** Don't add SWR, React Query, or tRPC. Next.js server components plus server actions cover every use case in this app.

## What NOT to do

- Don't add a separate REST/GraphQL API layer — use server actions
- Don't add Redux, Zustand, or any global state library — URL state + React state handles this
- Don't add `react-router-dom` — Next has its own router
- Don't put secrets in code or in `NEXT_PUBLIC_*` env vars — those ship to the browser
- Don't bypass RLS by using the service-role key client-side. Service-role is server-only.
- Don't write inline styles — use Tailwind utilities and design-system components
- Don't hard-code colours, spacing, or radii — reference the design tokens

## Adding a new feature

1. Read `00-working-brief.md` for the product context
2. Read the relevant task doc in `docs/tasks/`
3. Check `02-data-model.md` to see if you need schema changes
4. Check `03-design-system.md` for tokens and component patterns
5. Build server-first, add client interactivity only where needed
6. Update `HANDOFF.md` when the task is complete
