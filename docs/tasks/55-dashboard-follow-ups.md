# Task 55: Dashboard follow-ups from Brad's review

**Status:** ✅ All seven items done (2026-09-16). Brad's four scope decisions are settled (below). Items 6 and 7 shipped as Tasks 56 and 57; items 4, 1 and 2 as Tasks 58, 59 and 60; items 3 and 5 needed no code and are closed here. **One owner step outstanding:** migration `0078` for Task 58, without which the email change is inert.

## Brad's decisions (2026-09-16)

| Question | Answer |
|---|---|
| What "chat" means (item 2) | **Better customer-to-mechanic messaging**, not live support chat |
| Where public reviews go (item 1) | **Homepage only**, driven by the one existing `is_public` switch |
| A "within 2 hours" cancellation tier (item 3) | **No.** Keep the three live tiers |
| Scope | All seven items, **staged** |

## Item status

| Item | State |
|---|---|
| 1. Review switch controls the public website | ✅ Built, Task 59. Homepage only, one switch |
| 2. Chat | ✅ Built, Task 60. Scoped to customer-to-mechanic messaging |
| 3. "Under 2 hrs" cancellation row | ✅ Closed, no code. Decision: keep as is |
| 4. Our own auth, no Supabase screens | ✅ Built, Task 58. **Awaiting migration `0078`** |
| 5. Reschedule keeps the 2-hour window | ✅ Closed, already shipped in Task 48 |
| 6. Deep links lost at sign-in | ✅ Built, Task 56 |
| 7. Guest-era bookings can't be disputed | ✅ Built, Task 57 |

## Where things stand

- **Built:** Tasks 48 to 54, committed and pushed on `task-43-parts-in-customer-prices` (`8dc1aa9`, `8568b8c`, `f508725`).
- **Migrations:** `0071` to `0077` are applied (Brad). Confirmed against the live schema through PostgREST on 2026-09-15: every new table, column, view and RPC is there.
- **Not checked yet:**
  - any signed-in dashboard screen in a browser
  - `next build`
  - saved cards with Stripe test cards
- **App:** the handover brief `docs/mobile-app-brief-2026-09-15.md` is ready to send.
- **Still blocking:** AAG must allowlist `80.1.6.55` before repairs with parts can be booked (Task 43).

---

## 1. The review switch should control the public website

**Brad:** the admin switch should show or hide a review on the website.

**Today**
- `reviews.is_public` (0074), with a "Shown on profile" switch on `/admin/reviews`.
- It only feeds `mechanic_public_reviews`, which is the mechanic profile inside the dashboard and the app. Only customers who have booked that mechanic see it.
- The public website shows no reviews. That was parked in Task 46:
  - service-role read of allow-listed columns
  - only reviews with a comment
  - leave out deleted accounts
  - consent text
  - `revalidatePath`

**To do**
- Build reviews on the public website, driven by the same `is_public`.
- Relabel the admin switch and its caption, for example "Shown on website".
- Change the review forms' consent line to say the review may appear on the website.

**✅ Decided 2026-09-16**
- **One switch** covers both the website and mechanic profiles, the plain reading of Brad's note.
- **Homepage only.** No public mechanic pages, so nowhere else to place them.

**Also found:** `mechanic_public_reviews` **cannot be reused** for this. It is `revoke all … from anon` and gated on `has_booking_with_mechanic`, so only a signed-in customer who already booked that mechanic sees anything. The public read has to be a service-role read of allow-listed columns, as Task 46 parked it.

Two further things to handle when building it:
- `setReviewVisibility` only calls `revalidatePath("/admin/reviews")`, and the homepage sets `revalidate = 3600`, so a hidden review would linger up to an hour. It needs `revalidatePath("/")`.
- `is_public` does **not** change a mechanic's average: `lib/mechanics/aggregates.ts` recomputes `mechanics.rating` from every review. That is intentional and documented on the column.

**App:** the consent line copy changes.

## 2. Chat

**Brad:** chat needs building on the website, the customer app, the mechanic console, and the mechanic app once it exists.

**Today**
- **Booking messages between customer and mechanic exist:**
  - the `messages` table and `lib/messages/send.ts`
  - the customer chat at `/dashboard/bookings/[id]/messages`
  - the thread on the mechanic's job page
  - it polls rather than using Realtime
- **There's no chat with Book My Tech support.** The help centre shows email only, and the mockup's Chat and Phone cards are hidden.

**✅ Scoped 2026-09-16: (b), better customer and mechanic messaging.** Not live support chat. So no conversation or message tables, no admin support inbox, no phone line, and the help centre's hidden Chat and Phone cards stay hidden.

**But not Realtime.** `useStayFresh` polling is the project's standing pattern and `messages` is deliberately outside the Realtime publication (`0049`). The work is unread counts and surfaces, not a transport change.

**The actual gaps, found 2026-09-16:**
- Unread messages never reach the Inbox or the header dot. `lib/inbox/events.ts` is an allow-list with no message entry, while `message_sent` already exists as a `booking_events` type. Adding it needs no schema change.
- The mechanic console has no Messages nav item and no unread badge, so a thread is reachable only by opening its job.
- The mechanic app does not exist and `app/api/mobile/v1/` is customer-only. Nothing to build there.

**Then plan it across:**
- the website dashboard
- the customer app
- the mechanic console (`/mechanic`)
- an admin inbox, since someone has to answer support chat
- the future mechanic app

**Support chat likely needs:** conversation and message tables, RLS, the Realtime publication and push notifications.

**Phone line:** out of scope unless Brad supplies a number and opening hours.

## 3. The "Under 2 hrs" cancellation row

*Explanation; decision pending.*

**The mockup.** The cancel screen's policy table has three rows:

| Mockup row | Fee |
|---|---|
| More than 24 hrs before | Free |
| Under 24 hrs | £20 |
| Under 2 hrs / mechanic en route | £40 |

**What the system actually charges** (`cancelFeeTiers`, set on `/admin/pricing`):

| Rule | Fee |
|---|---|
| More than 24 hours before | £0 |
| Within 24 hours | £30 |
| Once the mechanic has set off (status `en_route`) | £50 |

**There's no "within 2 hours of the slot" rule.** Cancelling an hour before, with the mechanic not yet on the way, costs £30. So the website and the endpoint label the third row "Once your mechanic is on the way", which is what's actually charged. The mockup's £20 and £40 were placeholders; the table shows the live figures.

**✅ Decided 2026-09-16: keep it as it is.** No "within 2 hours" tier. The three live tiers stand, and the cancel screen's third row already says what is actually charged, "Once your mechanic is on the way". Nothing to build: `cancelFeeTiers`, `feeFor` in `lib/bookings/manage-booking.ts`, `lib/bookings/cancellation-policy.ts`, the public `/cancellation-policy` page, the Terms and the app are all untouched. The mockup's £20 and £40 were placeholders and stay unbuilt.

## 4. Book My Tech's own auth: no Supabase screens, emails or redirects

**Brad:** use Book My Tech's own auth, with no Supabase views, screens or redirects.

Supabase stays the auth backend (users and sessions). Every screen, email and link a customer sees should be ours.

**Today**
- **Password reset is already ours:** `generateLink`, our email template, `/auth/callback`, then `/dashboard/set-password`.
- **Changing email isn't** (web `/dashboard/settings/email`, and the app). The browser calls `supabase.auth.updateUser({ email })`.
  - Supabase then sends its own confirmation emails.
  - Their links go through Supabase's verify endpoint and redirect to `/dashboard/settings?email=changed` (the app uses `bmtcustomer:///email-changed`).
  - This is the flow to replace.
- **Still to audit:**
  - signup (service-role user with `email_confirm: true`, so no email today)
  - the mechanic invite (`generateLink` plus our email)
  - any magic link
  - the redirect URLs and email templates configured in the Supabase dashboard

**To do**
1. **Server-side email change:**
   - Check the current password, as Change password does.
   - Generate the confirmation links ourselves, with `admin.generateLink({ type: 'email_change_current' | 'email_change_new' })` or our own token.
   - Send them with our Resend templates.
   - Confirm on our own route (`/auth/callback` already does `verifyOtp` with a token hash), then show our own success screen.
2. The password field on Change email then means something and can come back.
3. Keep the `on_auth_user_email_changed` trigger (0065) working.
4. **App:** the app needs a matching endpoint (e.g. `POST /api/mobile/v1/account/email`) instead of calling Supabase directly. Tell Brad.

## 5. "Reschedule keeps the 2-hour window"

**✅ Closed: already shipped in Task 48; nothing to do.** Explanation only, kept for the record.

A booking is made for a 2-hour arrival window, such as "Thu 18 Sep, 2pm–4pm".

- **Before Task 48:** moving a booking saved only the start time and wiped the window. The booking and its emails then read "Thu 18 Sep, 2:00pm", as if the mechanic would arrive at exactly 2pm.
- **Now:** moving it to 2pm–4pm saves the window too. The booking, the emails and the mechanic's schedule show "2pm–4pm", the same as when it was first booked.
- **App:** it gets the same result by sending `slotWindow` (brief §8).

## 6. Fix: deep links lost at sign-in

**✅ Built 2026-09-16 — see `docs/tasks/56-deep-links-through-sign-in.md`.** One helper, `lib/safe-next.ts`, now governs every reader of `next`. There turned out to be **four** loss points, not the two below: proxy, the login page, the sign-in and sign-up actions, and `/auth/callback`'s exact-match allow-list, which collapsed any path carrying an id to `/`. The funnel case was the worst of them, because a lapsed session mid-checkout lost the customer's quote.

**Symptom.** A signed-out customer opens a link from an email, such as `/dashboard/quotes/[id]`, and is sent to `/login`. After signing in they land on the dashboard instead of the quote.

**Cause** (found in the Task 48 review)
- `proxy.ts` drops the query string when it redirects: `redirectKeepingCookies` sets `url.search = ""`, around lines 158 to 172.
- `signInUnified` in `app/actions/sign-in.ts` ignores `next` and redirects by role, around lines 56 to 63.
- The quote, revision and report pages already redirect to `/login?next=…`, so the value is lost in between.

**To do**
- Carry a safe `next` through proxy's redirect and the sign-in action, and use it after a customer signs in.
- `next` must be a relative path under allow-listed prefixes such as `/dashboard`, never an absolute or protocol-relative URL.
- Test open-redirect attempts (`//evil.com`, `https://…`, encoded variants).
- Check `/auth/callback`'s own allow-list at the same time.

## 7. Fix: guest-era bookings can't be disputed

**✅ Built 2026-09-16 — see `docs/tasks/57-disputes-on-guest-era-bookings.md`.** `ownsBooking` now decides the customer arm everywhere. There were **five** wrong checks, not the three below, and the disputes list's inline guest arm was also slightly looser than the RLS policy it mirrors, so it was collapsed onto the shared rule too.

**Symptom.** A booking made before accounts were required, with no `customer_id` and linked to the customer by email, can't have a dispute raised. "Report a problem" is hidden on those for now, by the `ownedByAccount` check in `canReportProblem` (`app/(customer)/dashboard/(shell)/_home/booking-logic.ts`).

**Cause.** Three places only accept `customer_id === userId`:
- `/dashboard/disputes/new/[bookingId]` (around page line 39)
- `loadDispute` (`lib/disputes/load.ts`, around line 41)
- probably `openDisputeFor` (`lib/disputes/core.ts`)

Every other customer action uses `ownsBooking`, which matches RLS: the customer's `customer_id`, or no `customer_id` and the same email.

**To do**
- Use `ownsBooking` in those three places, and in the ownership filter of `(shell)/disputes/page.tsx`.
- Remove the `ownedByAccount` check from `canReportProblem` and its test.
- The mobile dispute routes share the core, so they'd start accepting those bookings too. That's additive; tell the app.

---

## Still open from Tasks 48 to 54

- ~~**Browser check**~~ **Done 2026-09-16.** `tests/e2e/dashboard-walk.spec.ts` opens all 13 no-booking screens signed in at 375px and 1280px, asserting no browser errors and no sideways scroll, with a screenshot attached for each. Judging them against the mockup frames is still a human's call. The booking-detail screens need a real booking.
- ~~**Build**~~ **Done 2026-09-16.** `next build` passes.
- **Saved cards end to end** with Stripe test cards: add, make default, remove, pay with a saved card at checkout, and account deletion removing the Stripe Customer.
- **App brief:** send `docs/mobile-app-brief-2026-09-15.md` to the customer app session. Items 1, 4 and 7 above will need a follow-up brief when built.
- **Dispute screens:** the dispute form and detail still use the shared components' old look (Task 48).

## When complete

Split into numbered tasks as each item is picked up. Tick them off here, update `docs/HANDOFF.md`, commit.
