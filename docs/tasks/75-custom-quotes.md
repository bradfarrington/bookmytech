# Task 75: Custom quotes from the admin dashboard

**Status:** 🟡 **Built 2026-11-13, not verified end to end.** Typecheck clean, 716 unit tests pass (new: `lib/custom-quotes/model.test.ts`), lint clean on every touched file, production build compiles. Checked on a dev server: the request page renders on desktop and phone, an unknown quote 404s, and `/book/time?quote=…` sends a signed-out visitor to sign in. **Migration `0089` applied to the live database 2026-11-13**; deployed the same day. Customer app updated (`bmt-customer-app` `20e7de5`). Deviation from the plan: the website quote page lives at `/book/quote/<id>` (sign-in `next=` only allows `/book` and `/dashboard`).

## Why (Brad, 2026-11-13)

> "Is there a way I can add a custom quote so if the customer requests a quote on a job we don't list I can custom make it and email them for approval from my dashboard?"

## Owner decisions (Brad, 2026-11-13)

1. **Yes** to an "Ask us for a quote" button for customers.
2. Approving goes **straight to booking** (time, address, card pre-authorised, dispatched).
3. **One total**, like every other price.
4. Offered to **every mechanic** (broadcast), never a chosen one.
5. Open **until either side cancels**: no expiry.

## What shipped

### Data: `0089_custom_quotes.sql`

`custom_quotes` and `bookings.source_custom_quote_id`; full description in `docs/02-data-model.md`. `requested → sent → booked`, or `declined` (customer) / `withdrawn` (admin). The hourly rate and commission are snapshotted when a quote is sent.

### Pricing and booking: one field, no new funnel

- `lib/custom-quotes/model.ts` (pure, tested): input cleaning, ownership (`customer_id`, or the account's email = the quote's email), `customQuoteRefusal`, and **`buildCustomQuote`**, which turns a sent quote into the same `RepairsQuote` the funnel already prices: one fixed line `q:<quote id>` at the total, the visit length, and the snapshotted commission.
- **The quote's id rides in the existing `quoteId` field** (website `?quote=`, mobile `/checkout/prepare` and `/bookings`). `resolveBookingQuote` and `loadCheckoutContext` try `custom_quotes` first, then follow-on quotes. A uuid is never both. So the time, address and confirm steps, the 3-D Secure return, account credit, discount codes and the mobile endpoints all work unchanged.
- `createBooking` takes the vehicle from the quote, sets no preferred mechanic (broadcast), appends "Quoted work: <details>" to the special instructions so the mechanic sees it, writes `source_custom_quote_id`, then marks the quote `booked`. The new job gets a `quote_approved` event (an existing type, so the apps already render it).
- The time and confirm steps say "When suits you?" / "Confirm booking" (not "return visit"), and Back goes to the quote.

### Customer (website)

- **"Ask us for a quote"**: a card under the repair list, a link under search results ("Not what you need?"), and one in the "Nothing matches" state. They carry the reg, make, model, postcode and search text.
- **`/book/quote/request`**: describe the job, plus reg, postcode, name, email and mobile. Prefilled for a signed-in customer, whose request is tied to their account and email. Guests can ask. Rate-limited (`mobile_quoterequest_*`: 3–4 a minute, 10–20 a day). Emails the admin (`ADMIN_NOTIFY_EMAIL`) and the customer.
- **`/book/quote/<id>`** (the link in the email): the price card, details, and **Book a time** (→ `/book/time?quote=<id>`; signed out → sign in, with "Create an account" prefilled). **Decline** / **Cancel my request** appear for the owner. Readable by anyone with the link (first name, car, price), but booking and declining need the matching account.

### Customer (dashboard)

- **`/dashboard/quotes`** ("Your quotes"): open quotes first, then closed ones. Each row opens `/book/quote/<id>`. It's linked from **Account → Your quotes**, and the dashboard home shows a **Your quotes** section whenever one is open (being priced, or ready to book).
- A quote joins the customer's account by email: when they ask (signed in, or a guest whose email has an account), when it's sent, and when they next open their quotes. `0089`'s `custom_quote_account_for_email` (service role only) finds the account. That is what lets a quote show in their dashboard and app, and be pushed.

### Admin: **Operations → Quotes** (`/admin/quotes`)

Three lists: **To price**, **Sent**, **Closed**. **New quote** starts one from scratch (for a customer who rang). A quote's page shows the customer's words and the form: customer, vehicle, "What's the work?", details, total, visit length. Buttons: **Save draft**, **Send to customer** (emails, plus a text when there's a mobile number), **Send updated quote** (corrects a sent one), and **Withdraw**. A booked quote links to its job.

**Added 2026-11-18:** the quote form's Vehicle section looks the registration up with DVLA (on leaving the box, Enter, or "Look up"). It fills Make and Model without overwriting what the admin typed, and shows "DVLA: Ford Ranger Wildtrak Ecoblue 4X4 A · 2024 · Diesel · Grey" under the fields. It doesn't warm NAPA parts.

### Notifications

Email templates (editable in `/admin/emails`): `custom_quote_request_received`, `custom_quote_sent`, `custom_quote_request_admin`, `custom_quote_declined_admin`. SMS: `custom_quote_sent`. **Push** when a quote is sent to an account: "Your quote is ready" / "£145 for <title>. Tap to view and book.", with `data: { customQuoteId, url }`. Current app builds only deep-link on `bookingId`, so until the app handles `customQuoteId` the push just opens the app.

### Mobile API (all additive)

- `POST /api/mobile/v1/quote-requests`: guest or signed in.
- `GET /api/mobile/v1/custom-quotes`, `GET /custom-quotes/:id`, `POST /custom-quotes/:id/decline`: signed in.
- Book with the quote's id as `quoteId` on the existing `/checkout/prepare` and `/bookings`.

## Acceptance

- [x] A customer can ask for a quote from the repair list and search, signed in or not.
- [x] The admin sees requests, prices them as one total, and emails the customer.
- [x] The admin can start a quote from scratch.
- [x] The customer books it straight from the link, through the normal time / address / card steps; offered to every mechanic.
- [x] No expiry; the customer can decline, the admin can withdraw.
- [x] Mobile endpoints for requesting, listing, declining and booking.
- [x] The customer's quotes in their web dashboard (`/dashboard/quotes`, a home section, an Account link).
- [x] A push notification when a quote is sent (the app opening it from `customQuoteId` is app work).
- [ ] End to end after `0089`: request → price → send → email link → book → job dispatched; decline; withdraw. *(Needs `0089` applied.)*

## App work

- **Customer app:** `docs/app-prompts/2026-11-13-customer-app-custom-quotes.md`. Run `npm run db:types` after `0089`.
- **Mechanic app:** `npm run db:types` after `0089` only. A booked custom quote reaches mechanics as an ordinary job with one fixed-price line; its details are in the special instructions.
