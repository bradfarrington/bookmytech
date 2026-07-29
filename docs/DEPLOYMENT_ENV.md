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

## Mobile API (`app/api/mobile/v1/**`) — no new variables

The mobile app's endpoints introduce **no environment variables of their own**.
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
3. Set a strong `CRON_SECRET` — otherwise the 8 cron endpoints are open.
4. Swap Stripe test keys → live keys, and create the prod Stripe webhook to get
   `STRIPE_WEBHOOK_SECRET`.
5. Confirm `APP_ENCRYPTION_KEY` matches whatever encrypted the existing DB rows.
6. Apply DB migrations up to and including `0043_api_rate_limits.sql`.
7. Redeploy so the new vars take effect (env changes don't apply to existing
   deployments).

> CLI shortcut: `vercel link` then `vercel env add <NAME> production`. List with
> `vercel env ls`. Pull prod values locally with `vercel env pull`.
