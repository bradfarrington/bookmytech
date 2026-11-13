# Task 75: Custom quotes from the admin dashboard

**Status:** 📝 **Planned, not started (raised 2026-11-13).** Waiting on Brad's answers to "Open questions" before building.

## Why (Brad, 2026-11-13)

> "Is there a way I can add a custom quote so if the customer requests a quote on a job we don't list I can custom make it and email them for approval from my dashboard?"

Not today. Every quote in the system (Task 33/34 `job_quotes`) is raised by a **mechanic** on an **existing booking**: `booking_id` and `mechanic_id` are required. There is nothing for "a customer asked us about a job the catalogue doesn't list".

## Proposed shape

Reuse Task 34's machinery, which already turns an approved quote into an ordinary booking ("priced from the quote instead of the catalogue, through the funnel from the slot step"). The difference is that an office quote has no original job and no mechanic.

1. **`custom_quotes`** (new table, admin-only RLS): customer (profile id when they have an account, else name, email and phone), vehicle (reg, make, model, looked up by reg as usual), lines (description and price, plus optional labour hours at the platform rate), a note, status (`draft` → `sent` → `approved` / `declined` / `expired` → `booked`), `expires_at`, a random link token, `booking_id` once booked, and a snapshot of the hourly and commission rates.
2. **Admin**: `/admin/quotes` lists them by status. "New quote" is a form: find or enter the customer, enter the reg, add lines and see the total update live, add a note, then **Send**. Sending emails the customer a link (new `custom_quote_sent` template), and SMS too if they have a phone.
3. **Customer**: the link opens `/quote/<token>` with the lines, total, note and expiry, plus **Approve and book** or **Decline**. Approve goes to `/book/slot?customQuote=<id>`: sign in or create an account (Task 61), pick a time and address, then the normal pre-auth hold and confirmation.
4. **Funnel**: `resolveBookingQuote` (Task 34) gains a third source, the custom quote. It writes `bookings.source_custom_quote_id`, and dispatch broadcasts like any booking. Mobile: `quoteId`-style additive field on `/checkout/prepare` and `/bookings`.
5. Optionally, **customers ask from the site**: a "Can't find your job? Ask us for a quote" link on the repair search's empty state and the browse page. The customer describes the job and gives their reg, and the request appears in `/admin/quotes` as a request to price.

## Open questions for Brad

1. **How do customers ask now**, and do you want the "Ask us for a quote" button (point 5) on the website, and later the app?
2. **When the customer approves**, should it go straight into booking (pick a time, card pre-authorised, mechanic dispatched), or just mark it approved so you arrange the visit yourself?
3. **How do you want to price it**: one total, or lines (labour hours at our rate, parts, fixed items)? If there are parts, does the mechanic buy them (as now) or do you?
4. **Mechanic**: broadcast like every other job, or do you sometimes want to pick the mechanic?
5. **Expiry**: how long should a quote stay open (14 days?)

## App work (when built)

A schema migration (`npm run db:types` in both apps), plus an optional customer-app screen for the quote link. The website flow works in a phone browser without app work.
