# Task 48: Customer dashboard rebuild (web)

**Status:** ✅ Built and checked in a browser (2026-09-16). Every screen exists and renders signed in at 375px and 1280px, with no browser errors and no sideways scroll — `tests/e2e/dashboard-walk.spec.ts`, 35 checks, a screenshot attached per screen. `tsc`, eslint, 581 unit tests and `next build` all pass. Migrations `0072` to `0077` applied (confirmed 2026-09-15). **Still open:** judging each screen against its mockup frame (a human's call, screenshots captured), and the booking-detail screens, which need a real booking.

## Why

The customer app was redesigned (`mockups/01` to `05`, identical to `bmt-customer-app/design/mockups`). Brad (2026-09-15): the website's dashboard uses the same design, "basically without the tabs at the bottom". The data the new screens need is Tasks 49 to 54.

## Shape

**Shell.** Every signed-in screen lives under `app/(customer)/dashboard/(shell)/`, a route group, so URLs are unchanged. `(shell)/layout.tsx` renders `components/dashboard/app-header.tsx`:
- **Desktop:** logo, the four tabs as pills (Home, Garage, Inbox with an unread dot, Account), "Book a mechanic" and the avatar.
- **Phone-width:** the tabs sit in a second row under the logo, still at the top.
- **`/dashboard/set-password`** stays outside the shell. It's a step of the reset email.

**Building blocks: `components/dashboard/ui.tsx`.** Use these, not hand-rolled equivalents, so every screen matches the mockups:
- **Layout:** `Screen` (narrow column, or `width="wide"` for Home), `Stack`, `PageHeader` (back chevron, title, action), `Section` (overline label and content)
- **Text:** `Overline`, `Caption`
- **Surfaces:** `Panel` (tones default / tint / float / live / warn / danger / dark / selected)
- **Tiles and pills:** `Tile`, `AvatarTile`, `StatusPill` (mockup pill, optional pulse), `LiveDot`, `UnreadDot`, `StarRating`
- **Buttons:** `Button`, `ButtonLink`, `buttonClass()` (mockup buttons: primary / secondary / ghost / destructive / dark / outline-danger; sizes sm / md / lg), `TextLink`
- **Lists:** `ListCard` and `ListRow` (the mockup list rows), `DetailRow`
- **States:** `EmptyState`, `Notice`
- **Switch:** `components/dashboard/toggle.tsx` is the mockup's blue switch.

**Data.**
- **Bookings:** `lib/dashboard/customer-bookings.ts`
  - `loadCustomerBookings(caller)`
  - `loadCustomerBooking(caller, id)`
  - `groupCustomerBookings`
  - `vehicleName`
  - Scoped exactly like `ownsBooking`, which fixes the old dashboard's looser email match.
- **Status words and groups:** `lib/bookings/status-meta.ts`, the same as the app.
- **Tasks 49 to 54:** `lib/addresses/`, `lib/garage/`, `lib/mechanics/profile.ts`, `lib/inbox/`, `lib/payments/saved-cards.ts`, `lib/availability/`, `lib/bookings/cancellation-policy.ts`.
- **Existing cores:** cancel, reschedule, review, messages, disputes, quotes and revisions go through their existing `app/actions/` wrappers.

## Screens

| Route | Mockup frame | Notes |
|---|---|---|
| `/dashboard` | 02 "Dashboard · Live booking", "Dashboard · First-time" | Greeting with date. Live hero (dark strip, mechanic, repair, vehicle · price, Call). "Waiting on you": quotes, revisions, proposed times. Upcoming cards, Past jobs (stars, price, Book again), empty state with How it works. Wide: side column with garage snapshot and referral. |
| `/dashboard/bookings/[id]` | 04 "Booking · En route", "Booking · Quote waiting" | Header "Job BMT-…" and status pill. Waiting-on-you cards. Mechanic row (links to profile; Call when live; Message). Details (When / Where / Parking / Vehicle / Jobs). Payment list. Actions (Reschedule, Cancel, Review, Report, Report a problem, Book again). |
| `/dashboard/bookings/[id]/messages` | 04 "Messages" | Chat bubbles and composer (`sendMessage`, `markMessagesRead`) |
| `/dashboard/bookings/[id]/reschedule` | 04 "Reschedule" | Day chips, 2-column window tiles with "N mechanics" (`slotAvailabilityFor`), reason |
| `/dashboard/bookings/[id]/cancel` | 04 "Cancel confirm" | Fee card (`quoteCancellation`), reason, policy table (`cancellationPolicy`) |
| `/dashboard/bookings/[id]/review` | 04 "Review" | Stars, tags (`REVIEW_TAGS`), comment, consent line |
| `/dashboard/bookings/[id]/report` | 04 "Service report" | Existing report; restyled header |
| `/dashboard/quotes/[id]`, `/dashboard/revisions/[id]` | 04 "Quote", "Revised job" | Existing flows; mockup styling (dark total card; amber revised) |
| `/dashboard/disputes/…` | 04 "Report a problem", "Dispute" | Existing flows inside the shell |
| `/dashboard/mechanics/[id]` | 04 "Mechanic profile" | `loadMechanicProfile` |
| `/dashboard/garage` | 05 "Your garage" | `listGarage`, add, rename, remove, MOT warning, Book, History |
| `/dashboard/inbox` | 02 "Notifications" | `loadInbox`; tabs All / Bookings / Reminders; Today / Yesterday / date groups; Mark all read |
| `/dashboard/settings` | 05 "Settings" | Profile card, Your details, Account rows, Support, Sign out, Delete account. Keeps the `?email=changed` banner (Supabase redirect URL) |
| `/dashboard/settings/reminders` | 02 "Service reminders" | Master switch plus Push / Email / Text |
| `/dashboard/settings/email` | 05 "Change email" | |
| `/dashboard/settings/password` | 05 "Change password" | Current password checked first |
| `/dashboard/settings/delete` | 05 "Delete account" | Web wrapper over `deleteCustomerAccountFor` |
| `/dashboard/settings/payment-methods` | 05 "Payment methods" | Saved cards (Task 53) and account credit |
| `/dashboard/settings/addresses` | 05 "Addresses" | Task 49 |
| `/dashboard/help` | 05 "Help centre" | Email contact only (no chat or phone exists) |

**Outside the dashboard**
- The booking flow's Address step offers saved addresses.
- The Time step shows mechanics per window.
- Web checkout lists saved cards.
- The public review page carries the consent line.
- `/admin/reviews` gets a "Shown on profile" switch.

## Rules

- **Copy** (`docs/03-design-system.md`): no em dashes, "vetted" never "DBS", only true claims, and "Not set" rather than a dash.
- **Omissions:** the mockups show features that don't exist, such as chat support, a phone line and ETA minutes. Leave them out rather than faking them.
- **Before a migration is applied**, a screen whose table is missing (Tasks 49 to 53) shows a quiet "not available yet" state instead of failing.
- **Cookie-session callers only.** Nothing in a URL or form decides whose data is read.
- **Next 16:** read `node_modules/next/dist/docs/` before using an unfamiliar API.

## What shipped

**Screens.** Every screen in the table above exists at its route. Built on the shared blocks, with each screen's rules in small pure modules and unit tests:
- Home logic: `_home/booking-logic.ts`
- Garage display
- Inbox grouping and icons
- Card labels
- Password strength
- The reschedule window check

**Changes to shared code**
- **Reschedule keeps the window.** `rescheduleBookingFor` takes an optional `slotWindow`, kept when it's a 2-hour label whose start is the new time (`lib/bookings/reschedule-window.ts`). The website sends it. The mobile route accepts it additively, and old builds are unchanged.
- **Signed-in review action.** `submitReviewAsCustomer` (`app/actions/reviews.ts`) enforces ownership. The public `submitReview` is unchanged.
- **Parking vocabulary** moved to `lib/bookings/parking.ts`, which server components can import. `address-draft.ts` re-exports it.
- **Chat errors:** a failed message now returns a sentence, not the database's error text (`lib/messages/send.ts`). This also reaches the mobile messages route.
- **Saved addresses:** `listAddresses` takes the customer id, because RLS also lets an admin read every row.
- **Rate limits:** the website's garage and card actions and both availability actions use the same limits as the app endpoints.

**Cleanup.** Home has its own route group, `(shell)/(home)/`, so its skeleton only shows for Home. Every other screen gets a generic one. The old dashboard components are deleted. The ⋮ menu moved to `components/dashboard/overflow-menu.tsx`.

**Deviations from the mockups, all to keep claims true or match what exists**
- **Left out:**
  - no illustrated map, ETA, "Online" or "Delivered"
  - no "Book MOT" button: the MOT warning uses the normal Book button
  - no Change email password field: it would be bypassable, since the change goes browser to Supabase
  - no "6 years / HMRC" line on Delete account
  - no chat or phone in Help centre
- **Reworded:**
  - Garage shows "Last job", not "Last service"
  - the third cancellation tier reads "Once your mechanic is on the way"
- **Booking detail map:** it shows the mechanic's live position from `mechanic_locations`, only while they're on the way, and nothing when there's no fresh fix.
- **Reschedule:** offers 14 days, and no All day (the core can't store it on a move).
- **Disputes:** the form and detail body are the shared `components/disputes/*`, left as they are because the mechanic side uses them. So they don't yet match the mockup's option cards.
- **Web account deletion:** refuses staff accounts. It has no rate limit of its own; Supabase throttles the password check.
- **Report a problem:** isn't offered on guest-era bookings. `/dashboard/disputes/new` only accepts bookings linked to the account.

## Acceptance criteria

- [x] Every screen in the table exists and renders at phone width and desktop. All 13 no-booking screens confirmed 2026-09-16 by `tests/e2e/dashboard-walk.spec.ts`, with a screenshot attached for each.
- [ ] Each screen judged against its mockup frame. Screenshots are captured for it, but the comparison is a human's call. The booking-detail screens also need a real booking — `dashboard-walk.spec.ts` lists what it does not cover.
- [x] No bottom tab bar; the header carries the four destinations, Book, and the unread dot
- [x] Old dashboard components no longer used are deleted
- [x] `tsc`, `eslint` and unit tests pass; `next build` passes. All four now pass (2026-09-16): 581 unit tests, and eslint is down to 20 pre-existing problems now that `proposal/` is ignored.
- [x] Checked in a browser (2026-09-16), signed in as the seeded e2e customer, at 375px and 1280px: no browser errors and no sideways scroll on any screen.

## Mobile app

None for this task itself; the app already has these screens. Its data work is in Tasks 49 to 54 and the handover brief.

## When complete

Tick the boxes above, set the Status line, update `docs/HANDOFF.md`, commit.
