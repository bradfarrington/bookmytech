# Task 55: Dashboard follow-ups from Brad's review

**Status:** 📝 Notes only, nothing built (2026-09-15). Written at the end of the session so the work can carry on from another machine.

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

**Decide with Brad**
- whether one switch covers the website and mechanic profiles (the plain reading of his note)
- where on the site reviews appear (homepage, mechanic pages)

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

**To do: scope it first.** Confirm whether "chat" means:
- (a) live chat with Book My Tech support
- (b) better customer and mechanic messaging (Realtime, unread counts, push)
- (c) both

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

**Decision for Brad:** keep it as it is, or add a real "within 2 hours" tier. A new tier touches:
- a new platform setting and `feeFor` in `lib/bookings/manage-booking.ts`
- `cancelFeeTiers` and `lib/bookings/cancellation-policy.ts`
- the public `/cancellation-policy` page and the Terms
- the app

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

*Explanation; nothing to decide.*

A booking is made for a 2-hour arrival window, such as "Thu 18 Sep, 2pm–4pm".

- **Before Task 48:** moving a booking saved only the start time and wiped the window. The booking and its emails then read "Thu 18 Sep, 2:00pm", as if the mechanic would arrive at exactly 2pm.
- **Now:** moving it to 2pm–4pm saves the window too. The booking, the emails and the mechanic's schedule show "2pm–4pm", the same as when it was first booked.
- **App:** it gets the same result by sending `slotWindow` (brief §8).

## 6. Fix: deep links lost at sign-in

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

- **Browser check:** every dashboard screen against its mockup, signed in as a customer, at 375px and on desktop.
- **Build:** `next build` with the dev server stopped.
- **Saved cards end to end** with Stripe test cards: add, make default, remove, pay with a saved card at checkout, and account deletion removing the Stripe Customer.
- **App brief:** send `docs/mobile-app-brief-2026-09-15.md` to the customer app session. Items 1, 4 and 7 above will need a follow-up brief when built.
- **Dispute screens:** the dispute form and detail still use the shared components' old look (Task 48).

## When complete

Split into numbered tasks as each item is picked up. Tick them off here, update `docs/HANDOFF.md`, commit.
