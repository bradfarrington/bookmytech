# Deployment — Environment variables

Checklist of every environment variable the app reads, for when we deploy to
Vercel. **This file is committed to git — it holds NO real secret values.** The
live values live in `.env.local` (git-ignored) for local dev, and must be added
to the Vercel project (Settings → Environment Variables, or `vercel env add`)
for Production (and Preview, where you want previews to work end-to-end).

Legend: **🔑 secret** (never commit) · **🌐 public** (safe, shipped to the
browser — prefixed `NEXT_PUBLIC_`) · **Required** = app breaks without it.

---

## Core — Supabase & site

| Var | Req | Type | Notes / where to get it |
|-----|-----|------|-------------------------|
| `NEXT_PUBLIC_SITE_URL` | ✅ | 🌐 | Prod: `https://<your-domain>`. Used for email links, Stripe/redirect callbacks, cron `siteUrl()`. Locally `http://localhost:3000`. |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | 🌐 | Supabase → Project Settings → API → Project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | 🌐 | Supabase → API → `anon` public key. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | 🔑 | Supabase → API → `service_role` key. Server-only; full DB access. |

## Encryption & cron

| Var | Req | Type | Notes |
|-----|-----|------|-------|
| `APP_ENCRYPTION_KEY` | ✅ | 🔑 | 32-byte hex (64 chars). AES-256-GCM key for mechanic bank details (`lib/crypto/encrypt.ts`). **Must match the key used to encrypt existing rows — do not rotate casually.** Generate: `openssl rand -hex 32`. |
| `CRON_SECRET` | ✅ (prod) | 🔑 | Bearer token every `/api/cron/*` route checks. **If unset, all cron routes are publicly callable** — fine locally, dangerous in prod. Vercel Cron sends it automatically once set. Generate: `openssl rand -hex 32`. |

## Email (Resend)

| Var | Req | Type | Notes |
|-----|-----|------|-------|
| `RESEND_API_KEY` | ✅ | 🔑 | Resend dashboard → API Keys. Sends all transactional email (`lib/email/send.ts`). |
| `ADMIN_ALERT_EMAIL` | ⬜ | plain | Where new-application alerts go. Falls back to `help@bookmytech.co.uk`. |
| `ADMIN_NOTIFY_EMAIL` | ⬜ | plain | Admin notification recipient (general ops alerts). |

## Payments (Stripe)

| Var | Req | Type | Notes |
|-----|-----|------|-------|
| `STRIPE_SECRET_KEY` | ✅ | 🔑 | Stripe → Developers → API keys. Use `sk_test_…` in preview, `sk_live_…` in prod. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ✅ | 🌐 | Stripe publishable key (`pk_test_…` / `pk_live_…`). |
| `STRIPE_WEBHOOK_SECRET` | ✅ | 🔑 | **Not yet in `.env.local`.** Signing secret for `/api/webhooks/stripe`. Prod: create the webhook endpoint in the Stripe dashboard → copy `whsec_…`. Local: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` prints one. |

## Vehicle lookup (DVLA + DVSA MOT)

| Var | Req | Type | Notes |
|-----|-----|------|-------|
| `DVLA_API_KEY` | ✅ | 🔑 | DVLA Vehicle Enquiry Service API key. |
| `MOT_API_KEY` | ✅ | 🔑 | DVSA MOT History API key (supplies model + MOT history). |
| `MOT_CLIENT_ID` | ✅ | 🔑 | DVSA OAuth client id. |
| `MOT_CLIENT_SECRET` | ✅ | 🔑 | DVSA OAuth client secret. |
| `MOT_TOKEN_URL` | ✅ | plain | OAuth token endpoint (Microsoft login URL — not secret). |
| `MOT_SCOPE` | ✅ | plain | OAuth scope (`https://tapi.dvsa.gov.uk/.default`). |

## Repair catalogue & labour times (HaynesPro) — required for booking

Every booking is a HaynesPro repair (Task 17), so without these the booking
funnel has nothing to sell. `lib/haynespro/client.ts` treats the integration as
**unconfigured** when the two distributor values are missing (`/admin/vehicles`
shows a "not configured" banner and lookups fail).

| Var | Req | Type | Notes |
|-----|-----|------|-------|
| `HAYNESPRO_DISTRIBUTOR_USERNAME` | ✅ | 🔑 | Data Exchange distributor login (`lib/haynespro/client.ts`). |
| `HAYNESPRO_DISTRIBUTOR_PASSWORD` | ✅ | 🔑 | Data Exchange distributor password. |
| `HAYNESPRO_USERNAME` | ⬜ | plain | Per-app username minted against the distributor account. Falls back to `bookmytech`. |
| `HAYNESPRO_SSO_COMPANY_ID` | ✅ | 🔑 | Portal-to-Portal SSO (the mechanic's "open manual" link, `lib/haynespro/sso.ts`). Unset = SSO links are simply not offered. |
| `HAYNESPRO_SSO_PASSWORD` | ✅ | 🔑 | SSO distributor password. |
| `HAYNESPRO_SSO_USERTYPE` | ⬜ | plain | Falls back to `demo`. Set to the live value once off the demo licence. |

> `VRM_LOOKUP_USERNAME` / `VRM_LOOKUP_API_TOKEN` are in `.env.local` but **nothing
> reads them** — leftovers from an earlier supplier. Don't add them to Vercel.

## SMS credits (Twilio) — feature not fully wired yet

| Var | Req | Type | Notes |
|-----|-----|------|-------|
| `TWILIO_ACCOUNT_SID` | ⬜ | 🔑 | Twilio console. Needed to actually send SMS (`lib/sms/send-sms.ts`). |
| `TWILIO_AUTH_TOKEN` | ⬜ | 🔑 | Twilio auth token. |
| `TWILIO_FROM` | ⬜ | plain | Sender number/name. ⚠️ **Code reads `TWILIO_FROM`, not `TWILIO_FROM_NUMBER`** — the old key in `.env.local` was ignored. Falls back to the `sms_settings` table if unset. |

## SMS top-ups & invoicing (GoCardless + Xero) — optional, only if using paid SMS

| Var | Req | Type | Notes |
|-----|-----|------|-------|
| `GOCARDLESS_ACCESS_TOKEN` | ⬜ | 🔑 | GoCardless Instant Bank Pay top-ups (`app/actions/sms.ts`). |
| `GOCARDLESS_ENVIRONMENT` | ⬜ | plain | `sandbox` or `live`. |
| `GOCARDLESS_API_VERSION` | ⬜ | plain | GoCardless API version date. |
| `GOCARDLESS_WEBHOOK_SECRET` | ⬜ | 🔑 | Signing secret for `/api/webhooks/gocardless-sms`. |
| `XERO_CLIENT_ID` | ⬜ | 🔑 | Xero app client id (SMS-credit invoices, `lib/sms/xero.ts`). |
| `XERO_CLIENT_SECRET` | ⬜ | 🔑 | Xero app client secret. |
| `XERO_CONTACT_EMAIL` | ⬜ | plain | Invoice contact email. |
| `XERO_CONTACT_NAME` | ⬜ | plain | Invoice contact name. |
| `XERO_SALES_ACCOUNT_CODE` | ⬜ | plain | Xero sales account code. |

## Mobile API (`app/api/mobile/v1/**`) — one optional variable

The mobile app's endpoints introduce **one** environment variable of their own, `EXPO_ACCESS_TOKEN` (below).
They reuse `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the
Bearer-authenticated client in `lib/supabase/mobile.ts`),
`SUPABASE_SERVICE_ROLE_KEY` (account creation and the rate-limit counters) and
the DVLA/MOT keys above.

Two things that are configuration but deliberately **not** env vars:

- **Rate limits** live in the `platform_settings` table (`mobile_lookup_*`,
  `mobile_signup_*`), so they can be retuned in the database without a redeploy.
  Seeded by migration `0043`.
- **The app's base URL** is set in the app repo (`EXPO_PUBLIC_API_BASE_URL`),
  not here. This repo doesn't need to know the app exists at runtime.

⚠️ Migration `0043_api_rate_limits.sql` **must be applied** in every environment.
Until it is, every mobile endpoint returns 429 — the limiter fails closed on
purpose, so a missing guard can never become an open one on endpoints that spend
money and create accounts.

## Push notifications (Expo) — Task 19

| Variable | Required | Kind | Where to get it / notes |
|---|---|---|---|
| `EXPO_ACCESS_TOKEN` | ⬜ (recommended) | 🔑 | expo.dev → account → Access tokens. Expo's push service accepts **unauthenticated** sends, so pushes work without it — but with it set, Expo attributes and rate-limits sends per **project** rather than per IP, which matters on Vercel where the egress IP is shared. Used by `lib/push/send.ts`. |

⚠️ Migrations `0048`–`0050` **must be applied** for phase 5 of the app: `0050` creates the token tables (until then `POST /devices` returns 500 and every push is a logged no-op), `0049` turns on the Realtime events the app's dashboard and map subscribe to, and `0048` writes down the live-tracking schema that already exists on dev. Run `node scripts/verify-mechanic-visibility.mjs` afterwards.

## Provided automatically — do NOT set

| Var | Notes |
|-----|-------|
| `VERCEL_URL` | Injected by Vercel per-deployment (used as a `siteUrl()` fallback). |
| `NODE_ENV` | Set by the framework/runtime. |
| `TEST_OUTBOX_DIR`, `E2E_BASE_URL` | Test-only; not needed in prod. |

---

## Deploy checklist

1. In Vercel → Project → Settings → Environment Variables, add every **Required**
   var above for the **Production** environment (and Preview if you want working
   previews). Values come from `.env.local` / the provider dashboards.
2. Set `NEXT_PUBLIC_SITE_URL` to the real domain (not localhost).
3. Set a strong `CRON_SECRET` — otherwise the 9 cron endpoints are open.
4. Swap Stripe test keys → live keys, and create the prod Stripe webhook to get
   `STRIPE_WEBHOOK_SECRET`.
5. Confirm `APP_ENCRYPTION_KEY` matches whatever encrypted the existing DB rows.
6. Apply DB migrations up to and including `0043_api_rate_limits.sql`.
7. Redeploy so the new vars take effect (env changes don't apply to existing
   deployments).

> CLI shortcut: `vercel link` then `vercel env add <NAME> production`. List with
> `vercel env ls`. Pull prod values locally with `vercel env pull`.

---

## Search indexing — only the production domain is ever indexed

The app keeps itself out of search engines everywhere except `bookmytech.co.uk`
(and its subdomains). There is **no flag to set** — the rule is keyed on the
hostname, so the testing subdomain can never be indexed by accident and the
real domain can never be left noindexed by a forgotten switch.

- `lib/site.ts` — the rule (`isIndexableHost`, `isProductionSite`).
- `proxy.ts` — sets `X-Robots-Tag: noindex, nofollow` on every response whose
  `Host` is not production. Vercel does this itself for `*.vercel.app` URLs but
  not for custom domains, which is why the app has to.
- `app/layout.tsx` — adds the matching `<meta name="robots" content="noindex">`
  when `NEXT_PUBLIC_SITE_URL` is not production.
- `app/robots.ts` — `/robots.txt`. Disallows the signed-in areas and machine
  endpoints on every host, and deliberately does **not** `Disallow: /` on
  staging: a crawler must be allowed to read a page to see its noindex, and
  Google still lists URLs it is forbidden to fetch when something links to them.

Check after any deploy: `curl -sI https://<host>/ | grep -i x-robots-tag` —
present off production, absent on it.

## Staging for owner testing — `bmt.thedigicraft.co.uk`

A full copy of the site the owner can test as admin, customer and mechanic,
invisible to search engines (see above). A separate Vercel project, not a
branch of the future production one, so its env vars and domain never mix with
the real ones.

1. **Vercel plan first.** The team is on Hobby, and `vercel.json` schedules nine
   crons, several every 5 minutes or hourly. **Hobby refuses to deploy any cron
   expression that runs more than once a day** — the build fails with *"Hobby
   accounts are limited to daily cron jobs"* — so the project must be on Pro
   before the first deploy. The crons are not optional for a realistic test:
   they time out mechanic offers, escalate disputes and send reminders. (Hobby
   is also for non-commercial use only.)
2. **Create the project.** Vercel → Add New → Project → import
   `bradfarrington/bookmytech`, production branch `main`, framework Next.js
   (auto-detected). Add the env vars *before* the first deploy.
3. **Environment variables (Production scope).** Every ✅ Required row above,
   with staging values:
   - `NEXT_PUBLIC_SITE_URL=https://bmt.thedigicraft.co.uk` — email links, invite
     / set-password links and Stripe return URLs are all built from it.
   - Supabase: the existing dev project (migrated, has data). `APP_ENCRYPTION_KEY`
     must be the value that encrypted that project's rows — copy it from `.env.local`.
   - Stripe: **test** keys (`sk_test_…` / `pk_test_…`) so the owner can pay with
     `4242 4242 4242 4242` and a test mechanic can finish Connect onboarding
     without real money. Create a **test-mode** webhook endpoint for
     `https://bmt.thedigicraft.co.uk/api/webhooks/stripe` → `STRIPE_WEBHOOK_SECRET`.
   - `CRON_SECRET`: set it — unset means the cron routes are public.
   - Twilio: leave unset unless you want real texts sent to the tester's phone.
     GoCardless / Xero: sandbox or unset.
   - DVLA / MOT / HaynesPro keys as in `.env.local` — note these are billed per
     lookup, on staging as much as anywhere.
4. **Domain.** Project → Settings → Domains → add `bmt.thedigicraft.co.uk`. If
   `thedigicraft.co.uk` is already a domain in this Vercel team it verifies at
   once; otherwise add the CNAME Vercel shows (`cname.vercel-dns.com`) at the
   registrar.
5. **Supabase → Authentication → URL Configuration.** Add
   `https://bmt.thedigicraft.co.uk/**` to *Redirect URLs*. Mechanic invites,
   customer set-password links and password resets pass a `redirectTo` built
   from `NEXT_PUBLIC_SITE_URL`; Supabase silently substitutes its *Site URL* for
   any `redirectTo` not on the list, and the link lands on the wrong host.
6. **Deploy, then check:** `curl -sI https://bmt.thedigicraft.co.uk/ | grep -i x-robots-tag`
   prints `noindex, nofollow`, and `/robots.txt` lists the private areas.
7. **Test accounts.** One Supabase user has one `profiles.role`, and the
   customer dashboard bounces admins and mechanics to their own areas, so the
   owner needs three sign-ins. Plus-addressing on one inbox works
   (`owner+admin@…`, `owner+mechanic@…`, `owner+customer@…`).
   - Admin: sign up as a customer, then in the SQL editor
     `update public.profiles set role = 'admin' where id = '<auth user uuid>';`
   - Mechanic: admin invites them (or they apply at `/mechanics/apply` and the
     admin approves — the more realistic test).
   - Customer: `/signup`, or the account created during a booking.

**Moving to `bookmytech.co.uk` later:** add the domain to the production
project, set `NEXT_PUBLIC_SITE_URL`, swap Stripe to live keys and a live
webhook, add the new host to Supabase *Redirect URLs*, then remove
`bmt.thedigicraft.co.uk` from the staging project. There is nothing to
"un-noindex" — the staging host was never in the index.
