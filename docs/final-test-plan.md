# Final end-to-end test plan

A single guide to get every integration configured and then walk the whole app,
persona by persona, to surface bugs before launch. Work top to bottom.

> Status of the codebase: through **Task 12 Stage 1** and **Task 13 Stage B**
> (SMS). Task 13 Stage A (Pro tier) is not built yet — see "What's left" at the
> bottom.

---

## Part 1 — Environment variables

Set these in **`.env.local`** for local testing, and mirror them in **Vercel →
Project → Settings → Environment Variables** for the deployed test. `NODE_ENV`
and `VERCEL_URL` are set automatically — don't add them.

### Already set (confirm they're the right project/keys)

| Var | What it is | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key | same page |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (bypasses RLS — server only) | same page, "service_role" |
| `NEXT_PUBLIC_SITE_URL` | Site origin, no trailing slash (e.g. `http://localhost:3000`) | you set it |
| `STRIPE_SECRET_KEY` | Stripe secret (use **test mode** `sk_test_…`) | Stripe → Developers → API keys |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable (`pk_test_…`) | same page |
| `RESEND_API_KEY` | Resend key for transactional email | Resend → API Keys |
| `DVLA_API_KEY`, `MOT_*` | Vehicle lookup (DVLA + MOT history) | DVLA / DVSA developer portals |

### Missing — needed for a full test

| Var | Required? | What it is / where to get it |
|---|---|---|
| `APP_ENCRYPTION_KEY` | **Yes, to test mechanic onboarding** | 32-byte key for AES-256-GCM encryption of mechanic bank details. Generate: `openssl rand -hex 32`. Without it, application submit throws. |
| `STRIPE_WEBHOOK_SECRET` | **Yes, for Stripe Connect sync** | Signing secret for the Stripe webhook (`/api/webhooks/stripe`). Local: run `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and copy the `whsec_…` it prints. Prod: Stripe → Developers → Webhooks → endpoint signing secret. |
| `CRON_SECRET` | Recommended | Bearer token that protects every `/api/cron/*` route. Generate any random string. Locally you can omit it (routes run open) but then **anyone can hit your crons** — set it. To fire a cron by hand: `curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/<name>`. |
| `ADMIN_NOTIFY_EMAIL` | Recommended | Where dispatch-stall + dispute alerts go. Defaults to `help@bookmytech.co.uk` if unset. |
| `ADMIN_ALERT_EMAIL` | Recommended | Where new/updated mechanic-application alerts go. Defaults to `help@bookmytech.co.uk`. |

### Missing — needed only for the SMS / top-up test (Task 13 Stage B)

| Var | Required? | What it is / where to get it |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | **Yes (to send SMS)** | Twilio Console dashboard. |
| `TWILIO_AUTH_TOKEN` | **Yes** | Twilio Console (next to the SID). |
| `TWILIO_FROM` | **Yes** | A Twilio phone number you own (E.164, e.g. `+447…`). **Trial accounts** can't use an alphanumeric sender and can only text **verified** numbers — verify your test mobile in Twilio first. This wins over the panel's "sender name". |
| `GOCARDLESS_ACCESS_TOKEN` | **Yes (to buy credits)** | GoCardless Dashboard → Developers → Access tokens. Use a **sandbox** token for testing. |
| `GOCARDLESS_ENVIRONMENT` | **Yes** | `sandbox` for testing, `live` later. Selects the API host. |
| `GOCARDLESS_WEBHOOK_SECRET` | **Yes (to credit the top-up)** | Shown when you create the webhook endpoint (Part 2). |
| `GOCARDLESS_API_VERSION` | Optional | Defaults to `2015-07-06`. Leave unset. |
| `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` | Optional | Xero **Custom Connection** (client-credentials) credentials. If unset, invoicing is skipped and credits still apply. |
| `XERO_CONTACT_NAME` / `XERO_CONTACT_EMAIL` | Optional | The BMT owner as the Xero contact on the invoice. |
| `XERO_SALES_ACCOUNT_CODE` | Optional | Revenue account code (e.g. `200`). |

> **Minimum to test SMS end-to-end:** the three `TWILIO_*`, the three
> `GOCARDLESS_*` (token + environment + webhook secret), and a Twilio-verified
> mobile. Xero is optional — leave it off for the first pass.

---

## Part 2 — One-time setup

### 2a. Apply migrations
Make sure your Supabase database has **every** migration in
`supabase/migrations/` applied, including the new **`0026_sms_credits.sql`**.
Apply via the Supabase SQL editor or the CLI (`supabase db push`). Check after:
`sms_settings` should have exactly one row (`select * from sms_settings;`).

### 2b. Seed an SMS balance for testing
You won't have bought credits yet, so give yourself some and enable SMS:
```sql
update sms_settings
   set sms_enabled = true,
       sms_credits_balance = 50,
       low_credit_alert_email = 'you@example.com'
 where id = 1;
```

### 2c. Stripe webhook (local)
```bash
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```
Copy the `whsec_…` into `STRIPE_WEBHOOK_SECRET` and restart `npm run dev`.

### 2d. GoCardless webhook
You need a public URL for GoCardless to reach. Locally, tunnel it:
```bash
# e.g. with the Stripe CLI's tunnel, ngrok, or cloudflared:
ngrok http 3000          # gives https://<id>.ngrok-free.app
```
In **GoCardless Dashboard → Developers → Webhook endpoints → Create**:
- URL: `https://<your-tunnel-or-vercel-domain>/api/webhooks/gocardless-sms`
- Copy the **webhook secret** it generates → `GOCARDLESS_WEBHOOK_SECRET`.
- It will deliver `payments` events; the handler only acts on `confirmed`.

On Vercel the URL is just `https://<your-domain>/api/webhooks/gocardless-sms`
(no tunnel needed). The route is public and authenticated by the HMAC signature.

### 2e. Promote an admin
You need an admin login. If you don't have one:
```sql
update profiles set role = 'admin' where id = '<your-auth-user-id>';
```

---

## Part 3 — Run it

```bash
npm install        # ensure deps (note: vitest is currently missing — see below)
npm run dev        # http://localhost:3000
```

Keep three terminals open while testing: `npm run dev`, `stripe listen`, and the
tunnel. Watch the dev server logs — every SMS/email logs a line (and the sender
no-ops with `[sms stub]` if Twilio isn't configured).

> **Known build note:** `npm run build`'s TypeScript step currently fails only
> because the `vitest` dev-dependency isn't installed in this environment
> (`Cannot find module 'vitest/config'`). Run `npm install` to restore it;
> it's unrelated to app code.

---

## Part 4 — End-to-end test script

Test as three personas. Use **two browsers** (or a normal + incognito window) so
you can be a customer in one and the mechanic/admin in the other. Use Stripe
**test cards**: `4242 4242 4242 4242`, any future expiry, any CVC.

### A. Customer — booking happy path
1. Landing page → enter a real-format UK reg → confirm the DVLA/MOT lookup
   returns make/model.
2. Pick a service → choose date/time → enter address/postcode → reach payment.
3. Confirm the price breakdown matches the service's price + any area multiplier.
4. Pay with the test card. **Expect:** redirect to the confirmation page; a
   "Booking received" **email**; if you're signed in with a phone on your
   profile, a "Booking received" **SMS** (see SMS note below).
5. Check Stripe Dashboard (test mode): a **manual-capture PaymentIntent** is
   *authorised*, not captured.
6. **Bug-hunt:** book as a *guest* (no login) vs a *signed-in* customer. Guests
   have no phone → no SMS (expected). Try an invalid postcode / a service with an
   area override.

### B. Mechanic — onboarding → approval → job
1. `/mechanics/apply` (public) → complete all 5 steps incl. document upload and
   bank details → submit. **Needs `APP_ENCRYPTION_KEY`** or this throws. Expect
   an applicant email + an admin alert email.
2. As **admin** → `/admin/approvals` → review the application → approve. Expect
   the mechanic invite/approval email.
3. As the **mechanic** → sign in → `/mechanic` → set availability + service area
   → connect Stripe (test Connect onboarding; the `account.updated` webhook
   should flip the capability flags — watch `stripe listen`).
4. Customer's booking should **broadcast** to eligible online mechanics. As the
   mechanic, accept the offer.
5. Walk the lifecycle: **on the way** (`startJourney`) → **begin work** →
   **complete & charge**. **Expect** at each customer-facing step: an email,
   plus an SMS for *on the way* and *complete* (if customer has a phone).
6. Check Stripe: the PaymentIntent is now **captured**; a transfer to the
   mechanic's Connect account exists.
7. **Bug-hunt:** reject an application; let an offer expire; complete with the
   customer holding account credit (should reduce/zero the charge).

### C. Customer — messaging, reschedule, cancel
1. From the booking, open the message thread. Send a message **as the mechanic**
   → the customer should get an **SMS nudge** immediately (if phone present) and
   the dev log shows the send; `messages.sms_notified_at` gets stamped.
2. Send a message **as the customer** and *don't* open it as the mechanic. Wait
   5 min (or hand-fire the cron, Part 5) → the **unread sweep** should SMS the
   mechanic once, then never again for that message.
3. Reschedule a booking (customer proposes → mechanic responds, or vice versa) —
   confirm the emails.
4. Cancel a booking. **Expect:** the cancellation email + SMS, and the Stripe
   hold either captured (fee) or released (no fee) per the cancellation tier.

### D. Admin — operations
1. `/admin` overview, `/admin/jobs` list + detail (timeline, Stripe status, CSV
   export), reassign/cancel actions.
2. `/admin/pricing` — change a take-rate or cancellation fee; confirm it applies
   to **new** bookings only (existing keep their snapshot).
3. `/admin/disputes` — see Disputes flow below.
4. `/admin/sms` — the new panel: confirm balance shows 50, toggle on/off, save a
   sender ID + alert email, send a **test SMS** to your verified mobile (uses 1
   credit), watch the balance tick down and a `sms_log` row appear.

### E. SMS top-up (Task 13 Stage B) — the money path
1. `/admin/sms` → click **Buy** on a package → you're redirected to the
   GoCardless hosted Instant Bank Pay flow.
2. Complete it with GoCardless **sandbox** test bank details.
3. On return you'll see "Payment received — credits will appear shortly"
   (the redirect is just a hint). The **webhook** is the source of truth.
4. Within seconds the webhook fires → **balance increases** by the package's
   credits, a `sms_credit_purchases` row appears, and the low-credit flag clears.
   Watch your tunnel/dev logs for `gocardless-sms: added N credits`.
5. **Idempotency check:** in GoCardless, *redeliver* the same webhook event →
   the balance must **not** change again (one purchase row only).
6. **Low-credit alert:** set the balance low and send until it drops to ≤10 →
   exactly **one** alert email to your `low_credit_alert_email`; further sends
   don't re-alert; a new top-up re-arms it.
7. **Xero (optional):** if `XERO_*` set, confirm an AUTHORISED, paid invoice
   appears in Xero. If a Xero call fails, credits must still have applied.

### F. Disputes (Task 12 Stage 1)
1. As a customer, raise a dispute on a completed job (within 48h). Expect the
   mechanic payout to be **held** (transfer reversed in Stripe) + admin/party
   emails.
2. Use the 3-party thread; escalate; as admin resolve with a refund +
   compensation credit. Confirm the Stripe **refund** and the payout re-transfer.
3. **Bug-hunt:** 3 dispute losses in 30 days should auto-suspend the mechanic;
   suspended mechanics are excluded from dispatch.

### G. Reminders & referrals
1. Reminders: `/dashboard/settings/reminders` — toggle SMS on. The
   `schedule-reminders` cron seeds future reminders after a completed job; the
   hourly `send-reminders` cron emails/SMSes when due (hand-fire to test).
2. Referrals/credits (Task 11 Stage 3): redeem a referral, confirm the credit
   shows and applies at checkout. (Referral events are **email-only** — no SMS by
   decision.)

---

## Part 5 — Firing crons by hand

Don't wait for the schedule. With `CRON_SECRET` set:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/message-sms-sweep
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/send-reminders
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/dispatch-sweep
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/escalate-disputes
```
Each returns JSON with counts. Without `CRON_SECRET`, drop the header.

---

## Part 6 — Highest-risk areas to probe (likely bug sources)

- **Guest vs signed-in phone:** guest bookings capture no phone → all lifecycle
  SMS silently skip. Only signed-in customers (with a profile phone) get SMS.
  This is a known gap (see HANDOFF) — confirm it degrades gracefully, never errors.
- **Stripe money paths** (capture on complete, cancellation fee capture/release,
  dispute refund + transfer reversal/re-transfer) have **not been live-fired** —
  exercise each once against test data before trusting them.
- **Webhook signatures:** a wrong `STRIPE_WEBHOOK_SECRET` / `GOCARDLESS_WEBHOOK_SECRET`
  makes the webhook reject silently (400). If credits/flags don't update, check
  the secret first.
- **Concurrency on SMS credits:** rapid concurrent sends should never push the
  balance below 0 or double-spend (the atomic reserve guards this).
- **RLS:** try reaching another user's booking/messages while logged in as the
  wrong party — should be denied.

---

## What's left in Task 13

**Stage B (SMS):** code-complete. Remaining = **live verification** of the SMS
touchpoints on a real number once the Twilio + GoCardless creds above are in
place (acceptance box left unticked for exactly this).

**Stage A — Mechanic Pro tier: not started.** Full scope:
- Nightly eligibility cron (`/api/cron/pro-tier-check`) — ≥50 jobs, ≥4.8 rating
  (last 30), ≥90% acceptance (30d), 0 open disputes, docs current; 14-day grace.
- Snapshot the **12% Pro take-rate** at offer-accept (decide + implement the point).
- **Priority dispatch** — Pro mechanics get a ~5s head start on new offers.
- **Stripe instant payouts** for Pro accounts.
- `/mechanic/pro` info + progress page; **Pro badge** in customer-facing cards;
  Pro-progress card on the mechanic dashboard.
- Gained/lost notifications (email **and now SMS**, since Stage B landed).
- Schema: `mechanics.pro_since` / `pro_lost_at` + a `pro_tier_history` table.

After Stage A, Task 13 is done. (Task 12 Stages 2–4 — polish/ops/launch
checklist, much of it founder/external — also remain, separately.)
