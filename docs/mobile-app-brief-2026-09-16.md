# Mobile app brief: Tasks 56 to 60 (2026-09-16)

Five changes landed on the backend today. **Two need work in this repo**, one needs a copy change, and two need nothing at all. Nothing shipped is a breaking change: no path, response shape or field name was renamed, removed or retyped, so a phone running last month's build keeps working exactly as it does now.

Read this alongside `mobile-app-brief-2026-09-15.md`, which is still current.

## At a glance

| # | What changed | Your side |
|---|---|---|
| 1 | Email change is now first-party | **Must change.** New endpoint, and the screen needs a password field |
| 2 | Messages reach the inbox | **Must mirror**, or the app silently drops the new item |
| 3 | Reviews now appear on the public website | Copy change on the review form |
| 4 | Guest-era bookings can be disputed | Nothing, unless you hide the button yourself |
| 5 | Deep links survive sign-in on the web | Nothing. Web-only |

## Step 0: types

**`0078` is applied** (confirmed 2026-09-16), so run `npm run db:types` now. It adds one table, `pending_email_changes`, which is **service-role only** — RLS is on with no policies, so the app can neither read nor write it. It only appears in the generated types.

Nothing else changed in the schema. `message_sent` was already an allowed `booking_events.event_type`, so item 2 needed no migration.

---

## 1. Email change: stop calling Supabase

**This is the one real piece of work.**

### Why it changed

The app calls `supabase.auth.updateUser({ email })`. That makes **Supabase** send the confirmation email, from its own default template, with a link that goes through `https://<project>.supabase.co/auth/v1/verify` before bouncing to `bmtcustomer:///email-changed`.

The owner's instruction was that every screen, email and link a customer sees should be Book My Tech's. Password reset already was. Email change was the last one that wasn't.

Worth knowing, because it rules out the obvious alternative: **the admin API cannot drive Supabase's own email-change flow.** With Secure Email Change on it needs both addresses to confirm, which means two tokens, and `admin.generateLink` returns one per call while regenerating the pair each time — confirmed against the live project: after asking for the `email_change_current` token, the `email_change_new` token from the previous call came back `otp_expired`. So the backend now issues its own token instead.

### The new endpoint

```
POST /api/mobile/v1/account/email
Authorization: Bearer <supabase access token>
Content-Type: application/json

{ "new_email": "alex@newmail.com", "current_password": "…" }
```

**Both fields are required.** The password is checked server-side before a single email is sent.

```jsonc
// 200 — a confirmation link is now in the new inbox. NOTHING has changed yet.
{ "ok": true, "sentTo": "alex@newmail.com" }

// 200 — a refusal. Show `error` VERBATIM; it is written for a customer.
{ "ok": false, "error": "That isn't your current password. Please try again.", "field": "password" }
{ "ok": false, "error": "That email address is already in use.", "field": "new_email" }
{ "ok": false, "error": "That's already your email address.", "field": "new_email" }
```

`field` is `"new_email" | "password"` when the message belongs beside one input, and absent when it belongs to the form. A refusal is a request that **ran** and got a negative answer, so it is a 200 — only transport problems get a non-2xx (401, 403 for a staff token, 400/415, 429, 500).

### What the screen needs

1. **A password field.** It is required by the endpoint. It is also now meaningful: under the old flow the request went from the app straight to Supabase carrying the session, so a password check in front of it protected nothing.
2. **A waiting state.** On `{ ok: true }` tell the customer to open the link in their **new** inbox, and that the old address has been told too. Nothing changes until they do.
3. **Ask them to sign in again after the change.** The stored session still carries the old address until it refreshes.

### What to delete

- The `supabase.auth.updateUser({ email })` call.
- The `bmtcustomer:///email-changed` deep-link handler and its `emailRedirectTo`.

**There is deliberately no confirm endpoint.** The emailed link opens a Book My Tech web page, which works whether or not the app is installed and on whichever device the inbox is read — often a laptop. That was the point.

### Password reset is unchanged

Already first-party and staying that way. For the record, because it is the thing people assume: Supabase hands the backend an `action_link` pointing at `supabase.co/auth/v1/verify`, and **the backend discards it** and emails `https://bookmytech.co.uk/auth/callback?token_hash=…` instead.

**No link a customer can click, in any flow, goes to Supabase.** Verified by rendering the real emails and reading every `href`. One caveat, so nobody is surprised by it: the email template's **logo is an `<img>` served from Supabase Storage** (`/storage/v1/object/public/email-assets/logo-no-bg.png`). That is an image host, not a screen or a redirect, it is in every email the platform sends and has been since Task 04, and it predates all of this. Mentioned only because a search for "supabase.co" in an email body finds it.

---

## 2. Messages in the inbox: mirror the allow-list

**Small, but the app drops the new item until you do it.**

Booking messages already existed on both clients, but nothing made one *noticeable*: the inbox is built from `booking_events`, and the allow-list had no message entry. Sending a message now also writes a `booking_events` row:

```jsonc
{ "event_type": "message_sent", "payload": { "from": "mechanic" } }   // or "customer"
```

Your `src/lib/booking-events.ts` is the app's copy of that allow-list, and anything not named in it is dropped. Add:

- **label:** `New message from your mechanic`
- **only when `payload.from === "mechanic"`.** This matters. The event is written for both directions, for the audit trail and the admin activity feed. Without the check a customer gets notified about **their own** messages.
- **tapping it opens the booking's message thread**, not the booking summary. The point of the notification is to read the reply.
- give it a message icon rather than the fallback.

The body is deliberately **not** in the payload. `messages` already holds it, and duplicating customer words into an append-only table would give the same text two different deletion rules. Read the thread as you do now.

Nothing else changed: no new endpoint, `messages` is still read directly under RLS, and push on a mechanic's message already worked and is untouched.

---

## 3. Reviews now appear on the public website

`reviews.is_public` used to feed only the mechanic profile, which just customers who had booked that mechanic ever saw. It now also drives a reviews section on the public homepage. **One switch covers both**, so an admin hiding a review removes it from everywhere.

**Change the review form's consent line** to say the review may appear on the mechanic's profile **and on the Book My Tech website**, and that a surname or email is never shown. The website's wording:

> Your first name, rating and comment may be shown on your mechanic's profile and on the Book My Tech website. We never show your surname or email.

No API change. `mechanic_public_reviews` is untouched, so `fetchMechanicReviews` keeps working.

---

## 4. Guest-era bookings can be disputed

A booking made before accounts were required has no `customer_id` and is linked by `customer_email`. Those customers could already view, cancel, reschedule, review and message it, but **could not raise a dispute** — four service-role code paths compared `customer_id` with no email arm. Fixed.

So these now accept those bookings, all additive with no shape change:

- `POST /api/mobile/v1/bookings/:id/disputes`
- `POST /api/mobile/v1/disputes/:id/messages`
- `POST /api/mobile/v1/disputes/:id/withdraw`

**Nothing to do** — unless the app hides its own "Report a problem" on a booking with a null `customer_id`, mirroring a guard the website has now deleted. If so, it can stop.

---

## 5b. Checkout: can a returning customer sign in?

Added after the rest of this brief. On the **website's** Confirm step a returning customer was only offered "Create a password", with no way to say they already had an account — so they either guessed that typing their existing password would work, or spent a failed submit finding out. Fixed there with an "Already have an account? Sign in" switch.

**Please check whether the app's checkout has the same gap.** If its account block only offers account creation, returning customers hit the same thing.

Two rules bit on the website and may bite in the app if you add a sign-in path: a name and a minimum password length were both required before the form would submit, and neither has anything to do with signing in to an account that already exists — the minimum length especially, since it governs *choosing* a password and an older account may predate it.

**No API change.** The website uses a server action the app does not call; the app signs in through Supabase directly. `POST /checkout/prepare` and the booking endpoints are untouched.

---

## 5. Deep links through sign-in

Web-only: a signed-out customer opening an emailed dashboard link was landing on the dashboard root instead of the page. **No app impact** — the app has no cookie session, no `/login` and no redirects.

---

## Answering the two questions that came up

**No new fields on saved addresses, the garage or saved cards.** Those all shipped on 2026-09-15 as Tasks 49, 50 and 53, and nothing today touched them. `customer_addresses`, `customer_vehicles` and `stripe_customers` are exactly as `mobile-app-brief-2026-09-15.md` describes. Migrations `0069` to `0078` are **all** confirmed applied to the live database. `0078` is one service-role table the app cannot read — its RLS was verified by probing it as both anonymous and as the signed-in owner of a row: zero rows both times, and inserts refused.

**Nothing to configure at Stripe.** Saved cards use SetupIntents, Customers, PaymentMethods and CustomerSessions, all generally available on the pinned API version `2026-04-22.dahlia`. **No webhook is involved** — the Stripe webhook handles only `account.updated` for mechanic Connect onboarding. Stripe attaches a card to the Customer when the SetupIntent succeeds, and cards are listed from Stripe directly, so there is nothing to subscribe to and nothing to reconcile. The only outstanding Stripe work is a test-card run through add / make default / remove / pay at checkout, which is a verification step rather than a change.

## What to do, in order

1. `npm run db:types` — `0078` is already applied.
2. **Item 2 first** — it is a few lines in `src/lib/booking-events.ts` and until it lands, message notifications are silently missing.
3. **Item 1** — the new endpoint, a password field on Change Email, the waiting state, and delete the Supabase call and the `email-changed` deep link.
4. **Item 3** — the consent line.
5. Check item 4 for a guard worth removing.
