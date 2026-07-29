# Phase 1a — prompt for the CRM repo

**Two ways to use this. Either works.**

**A. Point Claude at the file.** Open Claude Code in the `bookmytech` repo and say:

> Read `/Users/bradfarrington/Downloads/bmt-customer-app/docs/phase-1a-crm-prompt.md`
> and do everything below the horizontal rule in it.

**B. Copy and paste.** Copy **everything below the horizontal rule** — from
"We are now building" to the end of the file. Ignore this header; it is the only
part not meant for Claude.

---

We are now building a **customer mobile app** (React Native / Expo, separate
repo: `bmt-customer-app`) that shares this database, this business logic, and
these integrations. This changes what this codebase is: it is no longer just a
web app, it is also the backend for a mobile client.

Two jobs. **Do part 1 first** — it is the part that outlives this session.

## Part 1 — record that the mobile app exists

Right now nothing in this repo knows the app exists, so a future session could
make a breaking change without realising. Fix that in your own docs.

**`AGENTS.md`** — add a standing section, because this must survive into every
future session, not just this one. It needs to say:

- A customer mobile app in `bmt-customer-app` consumes this codebase, via HTTP
  endpoints under `app/api/mobile/v1/` and by reading Supabase directly under
  the existing customer RLS policies.

- **The governing principle — apply this to anything, not just the list below.**

  A mobile app cannot be force-updated. Unlike the website, where a deploy
  instantly puts everyone on the new version, old builds stay installed on
  people's phones for months and keep calling whatever they shipped with. Some
  users never update at all.

  So **a shipped API path, response shape, or field name is a contract**, and
  breaking it breaks the app in the hands of real customers who cannot fix it
  by refreshing. Additive changes are safe — new endpoints, new optional
  fields. Renames, removals, type changes and changed semantics are not.

  When you are unsure whether something affects the app, ask: *would a phone
  running last month's build still work after this?* If the answer is no or
  you cannot tell, say so. This principle covers cases the list below does not
  anticipate, and it is the reason the list exists — not the other way round.

- **Whenever a change would require work in the app repo, say so explicitly in
  your summary to Brad** — do not assume he will infer it. State what changed,
  why it affects the app, and what needs doing on the app side.

  A non-exhaustive list of changes that always require telling him:
  - Any change to a request or response shape under `app/api/mobile/**`
  - **Any schema migration.** The app generates TypeScript types from the live
    schema (`npm run db:types` there), so every migration means regenerating.
    Renamed or dropped columns break it outright.
  - Any change to the booking status values or lifecycle — the app renders
    these as customer-facing labels
  - Any change to pricing or quoting that alters displayed figures
  - Any change to auth: signup fields, password rules, session or token
    behaviour
  - Any new required field on booking creation
  - Any change to `docs/03-design-system.md` tokens — the app mirrors them in
    its own `src/constants/theme.ts` and they must stay identical
  - Any change to the columns customers read directly: `bookings`, `profiles`,
    `booking_events`, `messages`, `reminder_schedules`, `reviews`

**`docs/HANDOFF.md`** — under project state, record that the mobile app exists,
what phase it is at, and that this repo is now its backend.

**`docs/01-architecture.md`** — document the split. Two clients now: the web app
(Server Actions, cookie sessions) and the mobile app (HTTP route handlers,
Bearer tokens, direct Supabase reads under RLS). Be explicit that business logic
lives in one place and both clients call it — the app must never reimplement
pricing, dispatch or notifications.

**`docs/tasks/18-mobile-api.md`** — a new task spec in your usual format
(`**Status:**` line, stages, acceptance-criteria checkboxes) covering the whole
mobile API layer, with parts 2–4 below as its first stage and the endpoints
under "Later stages" as the rest.

Then follow your normal "when complete" steps.

## Part 2 — the constraint that will bite

`lib/supabase/server.ts` builds its client from **cookies**. Mobile requests
carry `Authorization: Bearer <supabase-jwt>` and **no cookies**.

This is a live trap. `createBookingAction` derives the customer from
`supabase.auth.getSession()`. Called from a mobile route handler it would get
`null` and silently write a **guest booking** — `customer_id` null, so the job
never appears in the customer's account, and account credit and preferred-
mechanic handling are skipped. It would pass a smoke test. You would find out
when a customer said their booking had vanished.

Build `lib/supabase/mobile.ts` (or similar): a Supabase client authenticated
from a Bearer token, plus a helper that resolves the caller's user id and role
from that token and returns 401 when it is absent or invalid. Every
authenticated mobile route uses it. No mobile request may reach cookie-derived
auth without the caller being threaded through explicitly.

## Part 3 — `POST /api/mobile/v1/auth/signup`

Unauthenticated. Body `{ email, password, fullName }`.

`app/actions/signup.ts` does five things a client-side `supabase.auth.signUp()`
cannot: creates the user on the service-role client with `email_confirm: true`,
writes a unique `referral_code` onto the profile (with collision retry), sets
`referred_by`, grants referral welcome credit, and calls `linkGuestBookings`.
An account created without those is a *different shape* from a web account —
which is exactly why the app cannot do this itself, and why app sign-up is
currently broken until this ships.

That action takes `FormData` and ends in `redirect()`, so it is not callable
from a route handler. **Extract its core into a plain async function** — say
`lib/auth/create-customer.ts`, taking typed arguments and returning a result
object — then have both the existing Server Action and the new route handler
call it. Do not copy the logic. There must be exactly one implementation, or
the two clients will drift. The existing web signup flow must keep working
unchanged.

Keep the 8-character minimum and the "account already exists" wording.

## Part 4 — `POST /api/mobile/v1/vehicle/lookup` and rate limiting

Unauthenticated: the app lets guests price a job before making an account, so
anyone with the URL can call this.

Wraps `lookupVehicleAction`. Body `{ reg }`, returns the existing `LookupResult`
shape from `lib/dvla/types.ts` unchanged.

**This endpoint spends money on every miss.** DVLA VES and DVSA MOT are billed
per call, and the in-memory cache in `lookupVehicleAction` is per-serverless-
instance, so it will not protect you. It needs a real rate limit — per IP, and
per user where there is one. Choose sensible burst and daily caps, adjustable
without a redeploy.

Decide the backing store and tell me which you picked. We already have Postgres
via Supabase, so a small table plus the service-role client adds no new vendor;
Upstash Redis suits rate limiting better but is another dependency and account.
No strong preference — pick one, justify it in a comment, report the limits.

Also say whether a shared cache in front of DVLA is worth adding, given the same
reg gets looked up repeatedly across instances and sessions.

## Rules for all of it

- **Delegate, never reimplement.** Every handler is a thin wrapper over existing
  `lib/` and `app/actions/` code. If something is not callable, extract the
  shared core and have both callers use it — as with signup.
- Errors return JSON `{ "error": "<human-readable sentence>" }` with a real
  status code. The app shows that string to the customer verbatim, so write it
  for a customer, not a developer.
- Success returns JSON. **No redirects** — the app cannot follow them.
- **No permissive CORS.** A native app needs no preflight. Do not add
  `Access-Control-Allow-Origin: *`; it would make billed and account-creating
  endpoints callable from any web page.
- Version stays `v1`.
- Update `docs/DEPLOYMENT_ENV.md` for any new env vars.
- Read `node_modules/next/dist/docs/` for the route-handler API before writing
  code — per AGENTS.md, this Next.js version differs from what you may expect.

## The contract the app is already written against

`src/lib/api.ts` in the app repo expects:

- Base URL: `EXPO_PUBLIC_API_BASE_URL` + `/api/mobile/v1`
- Auth: `Authorization: Bearer <supabase access token>`; guest endpoints send no
  header
- Errors: any non-2xx with `{ "error": "..." }` — shown to the customer as-is
- Sign-up: `POST /auth/signup` with `{ email, password, fullName }`; on success
  the app immediately calls `signInWithPassword` with the same credentials, so
  the account must be usable straight away (hence `email_confirm: true`)

## Later stages — do not build these yet

Record them in the task spec; they get prompted separately once the scaffolding
above exists and the auth helper is proven.

| Endpoint | Wraps |
|---|---|
| `GET /repairs/tree`, `GET /repairs/search` | `lib/haynespro/tree.ts` |
| `POST /quote` | `quoteRepair` |
| `POST /checkout/prepare` | `prepareCheckout` |
| `POST /bookings` | `createBookingAction` — **the cookie/Bearer trap lands here** |
| `POST /bookings/:id/cancel` | `quoteCancellation`, `cancelBooking` |
| `POST /bookings/:id/reschedule` | `rescheduleBooking`, `respondToReschedule` |

## Done when

- `curl` against a local dev server creates a real customer via `/auth/signup`,
  with a referral code on the profile, and the existing web signup form still
  works
- A second signup with the same email returns the "already exists" message, not
  a 500
- `/vehicle/lookup` returns a real DVLA result, and hammering it trips the limit
  with a clear message rather than continuing to bill us
- No mobile route reaches cookie-derived auth
- `AGENTS.md`, `docs/HANDOFF.md`, `docs/01-architecture.md` and
  `docs/tasks/18-mobile-api.md` all reflect the mobile app
- You have told me: the rate-limit store, the limits, any new env vars, and
  anything needing a change in the app repo

## One caveat on the references above

The file paths and function names here were read from a **snapshot of this repo
taken 2026-07-29 14:12**, not a live checkout. If `app/actions/signup.ts`,
`lib/supabase/server.ts` or `app/actions/create-booking.ts` have changed since,
trust what you find in the working tree over what is written here, and tell me
where they differ.
