# Task 00 — Foundation

**Status:** ✅ Complete

The bootstrap task. Get from "empty folder" to "Next.js app deployed to Vercel with Supabase wired and route groups ready."

## Goal

Have a working Next.js project with TypeScript + Tailwind, Supabase backend with schema and RLS, auth scaffolding in place, deployed to Vercel and pushed to GitHub.

## Acceptance criteria

- [x] `npx create-next-app@latest bookmytech` run with TypeScript, Tailwind, App Router, ESLint
- [x] Dependencies installed: `@supabase/supabase-js`, `@supabase/ssr`, `lucide-react`, `recharts`, `class-variance-authority`, `clsx`, `tailwind-merge`, `react-hook-form`, `zod`, `@hookform/resolvers`, `date-fns`, `react-email`, `@react-email/components`
- [x] Route groups created: `app/(customer)/`, `app/(mechanic)/`, `app/(admin)/`
- [x] Default `app/page.tsx` moved into `(customer)` group
- [x] Supabase project provisioned in London (eu-west-2) region
- [x] `.env.local` populated with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [x] `.env.local` gitignored
- [x] `lib/supabase/client.ts` and `lib/supabase/server.ts` created
- [x] `middleware.ts` at project root for auth refresh
- [x] Schema applied: `profiles`, `services`, `bookings` tables with RLS
- [x] `handle_new_user` trigger created (with `search_path = public` fix)
- [x] Admin user created in Supabase and promoted to admin role via SQL
- [x] Repo pushed to GitHub
- [x] Vercel project created, env vars pasted, first deploy successful
- [x] `npm run dev` serves the default Next.js page at `localhost:3000`

## What's intentionally NOT done

- No login / signup screens (auth scaffolding only)
- No real UI — default Next.js placeholder still in place
- No design tokens in `tailwind.config.ts` yet
- No UI components
- No DVLA integration (key pending)

These are all in task 01.

## Files touched

- Whole project scaffolded
- `lib/supabase/client.ts`, `lib/supabase/server.ts`
- `middleware.ts`
- `.env.local`, `.gitignore`
- Supabase migrations (run in dashboard SQL editor)
