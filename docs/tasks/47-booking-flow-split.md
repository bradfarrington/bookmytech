# Task 47: Booking flow split into the app's steps

**Status:** ✅ Complete (2026-09-15). Price → Time → Address → Confirm on web, matching the app; checkout logic moved intact into `confirm-checkout.tsx`. No deviations from the plan, except that the Stripe e2e specs weren't run: `E2E_REG` isn't set locally.

## Why

The customer app's redesign (`mockups/`) books in separate steps: Vehicle, The job, Price, Time, Address, Confirm, Confirmed. The web funnel crammed Time, Address, account and payment onto one long `/book/slot` page. Brad chose to match the app's steps (2026-09-15), so a customer who uses both sees the same flow.

## What shipped

**Routes**

| Step | Route | Notes |
|---|---|---|
| Price | `/book/match` | "Pick a time" now goes to `/book/time` |
| Time | `/book/time` (new) | Day chips, 2-column window grid, All day, "offer several days" |
| Address | `/book/address` (new) | Address, postcode, parking chips, instructions |
| Confirm | `/book/slot` | Summary with Change links, account, discount code, payment |

`/book/slot` keeps its URL because Stripe's 3-D Secure `return_url` points at it, and links already sent to customers point at it too.

**State between steps**
- The job, vehicle and time travel in the URL (`reg`, `repairs`, `make`, `model`, `postcode`, `pref`, `quote`, plus `slot`, `window`, `days`). `lib/bookings/step-params.ts` builds and validates them (unit-tested).
- The address never goes in the URL. It lives in sessionStorage (`lib/bookings/address-draft.ts`), keyed by the job, so an address typed for one job is never replayed onto another.
- Each step re-quotes the price on the server (`lib/bookings/checkout-context.ts`). The URL never carries a price.
- A missing time sends the customer back to Time. A missing address sends them back to Address. The one exception is a 3-D Secure return, which restores both from its own draft.

**Checkout logic unchanged.** `slot-picker.tsx` became `confirm-checkout.tsx`. Only the time and address inputs moved out. Everything else is carried over as it was:
- the draft parked before `confirmPayment`
- resume on return
- `MONEY_HELD` / `NOTHING_HELD`
- `confirmedIntentId`
- `reportOrphanedHold`
- the discount-code re-prepare
- account creation before the pre-auth

Two things changed around them:
- `returnParams` also carries the time now.
- When a window closes mid-checkout, the time picker opens on Confirm itself, so the card hold survives.

**Shared pieces**
- `components/customer/step-header.tsx`
- `components/ui/alert.tsx`
- `app/(customer)/book/_components/time-picker.tsx` (used by Time, and by Confirm when a window closes)
- `ProgressStepper` restyled to the app's "Step N · Name / N of 5". A follow-on quote counts only Time and Address (2 steps). Confirm has no stepper.

**Copy**
- Price step:
  - "Fixed price" became "Price for this job".
  - "No call-out fee" was removed (unsourced).
  - The warranty now reads 12 months or 12,000 miles on eligible repairs.
  - The "pre-authorised now" line moved to Confirm, where it happens.
- Tracker: dispatch is described as a broadcast (first to accept takes it), not "matching you with the best available mechanic".
- `/book` trust line: "Charged only when the job's done · Vetted mechanics · 12 months or 12,000 miles warranty on eligible repairs".
- The support address customers see is `support@bookmytech.co.uk`: the confirmed page, the email footer and email template notes. Internal alert fallbacks (`ADMIN_ALERT_EMAIL` / `ADMIN_NOTIFY_EMAIL`) are unchanged.

**Tests**
- `tests/e2e/helpers/funnel.ts` walks Time and Address.
- The 3-D Secure spec's failed-challenge check looks for the restored address in Confirm's summary.
- **Bug fixed:** the funnel specs checked `HAYNESPRO_DISTRIBUTOR_*`, which Task 44 replaced with `HAYNESPRO_ID_DISTRIBUTOR_*` and `HAYNESPRO_CONTENT_DISTRIBUTOR_*`. As a result both Stripe specs were silently skipping. They still need `E2E_REG` set to run.

## Acceptance criteria

- [x] Price → Time → Address → Confirm, each on its own route, matching the app's order
- [x] The address is never in a URL; the time is
- [x] The price is re-quoted on the server at every step
- [x] Stripe safeguards moved without a behaviour change; `/book/slot` still the return URL
- [x] A window closing mid-checkout is re-picked on Confirm without losing the hold
- [x] Follow-on quotes (`?quote=`) use the same steps with a 2-step counter
- [x] E2E selectors kept: `a[href*="/book/match"]`, "Pick a time", window buttons named by their label with native `disabled`, "House number and street", "Full name", "Email address", "Continue to payment", "Pre-authorise £X", "Confirm booking", `bmt.checkout-draft.<pi>`, "Booking confirmed"
- [x] Copy fixes above
- [x] `tsc`, eslint on changed files, vitest, `next build`
- [x] Browser pass at 375 and 1280: no overflow, no page errors, address kept on "Change", redirects when the address or time is missing
- [ ] Both Stripe e2e specs run. **Deferred:** needs `E2E_REG` in `.env.local` (a reg that resolves live). The funnel walk above covered every step up to the card form.

## Mobile app

**No app-side work.** No migration, no `app/api/mobile/**` change, no booking-creation field change.

## When complete

Update `docs/HANDOFF.md`, then commit and push `task-47-booking-flow-split`.
