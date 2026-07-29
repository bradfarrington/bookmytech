<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# A customer mobile app consumes this codebase

There is a **customer mobile app** (React Native / Expo) in a separate repo,
`bmt-customer-app`. It shares this database, this business logic and these
integrations. **This repo is its backend.** It reaches us two ways:

- HTTP route handlers under **`app/api/mobile/v1/`** — `Authorization: Bearer
  <supabase access token>`, JSON in, JSON out, no cookies, no redirects.
- **Direct Supabase reads** under the existing customer RLS policies.

## The governing principle — apply it to anything, not just the list below

A mobile app **cannot be force-updated**. Unlike the website, where a deploy
instantly puts everyone on the new version, old builds stay installed on
people's phones for months and keep calling whatever they shipped with. Some
users never update at all.

So **a shipped API path, response shape, or field name is a contract.** Breaking
it breaks the app in the hands of real customers who cannot fix it by
refreshing. Additive changes are safe — new endpoints, new optional fields.
Renames, removals, type changes and changed semantics are not.

When you are unsure whether something affects the app, ask: **would a phone
running last month's build still work after this?** If the answer is no, or you
cannot tell, say so. This principle covers cases the list below does not
anticipate, and it is the reason the list exists — not the other way round.

## Whenever a change would require work in the app repo, say so explicitly

Put it in your summary to Brad. Do not assume he will infer it. State **what
changed, why it affects the app, and what needs doing on the app side.**

A non-exhaustive list of changes that always require telling him:

- Any change to a request or response shape under `app/api/mobile/**`
- **Any schema migration.** The app generates TypeScript types from the live
  schema (`npm run db:types` there), so every migration means regenerating.
  Renamed or dropped columns break it outright.
- Any change to the booking status values or lifecycle — the app renders these
  as customer-facing labels
- Any change to pricing or quoting that alters displayed figures
- Any change to auth: signup fields, password rules, session or token behaviour
- Any new required field on booking creation
- Any change to `docs/03-design-system.md` tokens — the app mirrors them in its
  own `src/constants/theme.ts` and they must stay identical
- Any change to the columns customers read directly: `bookings`, `profiles`,
  `booking_events`, `messages`, `reminder_schedules`, `reviews`

## Rules for the mobile API layer

- **Delegate, never reimplement.** Every handler is a thin wrapper over existing
  `lib/` and `app/actions/` code. If something is not callable from a route
  handler, extract the shared core and have *both* callers use it — never copy
  the logic, or the two clients drift.
- **Never let a mobile request reach cookie-derived auth.** `lib/supabase/server.ts`
  builds its client from cookies; mobile sends none. Use
  `lib/supabase/mobile.ts` and thread the caller through explicitly. See
  `docs/tasks/18-mobile-api.md` for why this is a live data-loss trap.
- Errors return JSON `{ "error": "<human-readable sentence>" }` with a real
  status code. The app shows that string to the customer **verbatim** — write it
  for a customer, not a developer.
- Success returns JSON. **No redirects** — the app cannot follow them.
- **No permissive CORS.** A native app needs no preflight. Never add
  `Access-Control-Allow-Origin: *`; it would make billed and account-creating
  endpoints callable from any web page.
- The version stays `v1`.

# Task tracking

Work is organised as numbered task specs in `docs/tasks/`. When you finish a task (or a step of one), keep its own md in sync — not just `docs/HANDOFF.md`:

- Set the `**Status:**` line at the top of the task's md to `✅ Complete (YYYY-MM-DD)` with a one-line note of what shipped and any deviations from the spec (e.g. routes that landed at a different path).
- Tick every acceptance-criteria checkbox you actually satisfied (`- [ ]` → `- [x]`). Leave a box unchecked only if the item was deliberately deferred, and say where it moved to.
- Then do the task's own "When complete" steps (update `docs/HANDOFF.md`, set the current task, commit).

A task is not "done" until its md reflects reality. Check this before moving to the next task.
