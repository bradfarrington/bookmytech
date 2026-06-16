# Book My Tech — Manual Test Guide

A plain-English walkthrough to test the whole app yourself. Format is simple:

> **Do this** → **Expect this**

Work top to bottom. Tick each box as you go. If something doesn't match the
"Expect this", note it and move on.

**Before you start**
- Run the app: `npm run dev` (restart it if you've just pulled config changes).
- Have a [Stripe test card](https://stripe.com/docs/testing) handy: `4242 4242 4242 4242`, any future expiry, any CVC, any postcode.
- For a card that needs extra authentication, use `4000 0025 0000 3155`.
- For a declined card, use `4000 0000 0000 0002`.
- You'll want three logins to test fully: a **customer**, a **mechanic**, and an **admin**.

---

## Automated coverage (Playwright)

Some of this guide is now an automated end-to-end suite — see
[`tests/e2e/`](../tests/e2e/README.md). Run it with `npm run test:e2e`.

| Guide section | Automated? |
|---|---|
| §1.1 Make a booking (core flow) | ✅ Partial — see the note under §1.1 |
| Everything else (§1.2 onward) | ⬜ Not yet — manual only (mapped as TODOs in the e2e README) |

Two caveats apply wherever automation touches money or messages:
- **Stripe**: the suite uses Stripe **test mode** and asserts against the Stripe
  **API**, not the dashboard. The in-browser card-entry + confirm step can't be
  automated (Stripe's hCaptcha bot-check never resolves under a robot), so that
  exact click is still **manual-only**.
- **Email/SMS**: the suite asserts the message was **dispatched** (captured to a
  test outbox), not that it arrived in a real inbox. Reading actual delivered
  mail stays **manual**.

---

## 1. Customer — booking a job

### 1.1 Make a booking (the core flow)

> **✅ Automated** by `tests/e2e/customer-booking.spec.ts` (two flows):
> - **Guest card pre-auth** — drives the funnel (service → price → slot →
>   checkout) and verifies a **manual-capture hold for the full price** that,
>   once confirmed, sits **uncaptured** (`requires_capture`). Checked via the
>   Stripe API, not the dashboard.
> - **Credit-covered booking** — a signed-in customer with account credit books
>   with no card step, verifying the **confirmation screen + booking reference**,
>   the booking row, and the **"we're finding your mechanic" email**.
>
> **Still manual** (not automated): the DVLA **reg lookup** (the suite passes the
> vehicle in directly), **typing the test card into the Stripe form and
> confirming**, and eyeballing the **real inbox** / **Stripe dashboard**.
- [ ] Go to the home page → start a booking → **enter a car reg** → **Expect:** the car's make/model is looked up and shown (if the reg isn't found, you can enter details manually).
- [ ] **Pick a service** (e.g. brake pads) → **Expect:** a price is shown.
- [ ] **Pick a date & time slot** → **Expect:** you're taken to a payment step.
- [ ] **Enter the test card and confirm** → **Expect:** a confirmation screen with a booking reference, and a "we're finding you a mechanic" status.
- [ ] **Check your email** → **Expect:** a booking confirmation email saying *"no money has left your account yet — it's only taken when the job is complete."*
- [ ] **Check Stripe → Payments → Uncaptured** → **Expect:** a hold (authorisation) for the full price. **Not** in the main balance yet — that's correct.

### 1.2 Customer dashboard
- [ ] Log in as the customer → go to your dashboard → **Expect:** your booking is listed with its current status.
- [ ] Open the booking → **Expect:** you can see the live status (sourcing mechanic / confirmed / on the way / in progress / complete).

### 1.3 Cancel a booking
- [ ] On an active booking, choose **cancel** → **Expect:** a confirmation, the booking shows as cancelled, and the card hold is released (or a cancellation fee is taken if one applies). Check Stripe → the uncaptured hold disappears or is partially captured.

### 1.4 Reschedule
- [ ] If a mechanic proposes a new time, you (as customer) → **Expect:** an email/notification, and the ability to accept the new time, keep the old one, or suggest another.

---

## 2. Mechanic — getting set up

### 2.1 Apply to be a mechanic
- [ ] Go to the mechanic application page → fill in the **5-step wizard** (details, service area, documents, bank details, references).
- [ ] **Upload documents** (photo ID, insurance, qualifications) → **Expect:** files up to **15 MB** upload fine. *(This was the 1 MB bug — anything bigger than 1 MB used to fail silently.)*
- [ ] Submit → **Expect:** a "we've received your application" screen + confirmation email. The admin also gets a "new application" email.

### 2.2 Admin approves the mechanic
- [ ] Log in as admin → go to the approvals/applications queue → **Expect:** the new application appears with a verification checklist.
- [ ] Approve it → **Expect:** the mechanic gets an "approved" email with a link to set their password / log in.

### 2.3 Mechanic connects Stripe (to get paid)
- [ ] Log in as the mechanic → **Expect:** a banner prompting you to connect Stripe before you can be paid.
- [ ] Complete the Stripe Connect onboarding (use Stripe's test data) → **Expect:** the banner disappears and "Get paid" shows as set up.

### 2.4 Go online
- [ ] As the mechanic, toggle yourself **online** → **Expect:** the status updates. (You must be online to receive job offers.)

---

## 3. Mechanic — doing a job (the money flow)

> This is the flow that captures payment and pays the mechanic. Test it carefully.

### 3.1 Receive and accept a job
- [ ] With the mechanic **online**, have the customer make a booking in their area (section 1.1) → **Expect:** within a few seconds, a **job offer** appears on the mechanic's **Jobs** screen ("New jobs near you").
- [ ] Click the offer → **Expect:** an offer detail screen. Accept it → **Expect:** *"Job accepted — it's yours"* and the offer leaves the feed.
- [ ] **First-to-accept test (optional):** with two mechanics online, both get the offer; the second to accept → **Expect:** *"this job has already been taken."*

### 3.2 Find the job and open it
- [ ] Go to **Schedule** in the sidebar → **Expect:** a "My jobs" list with the accepted job under **Active**. *(Today's jobs also show on the Jobs page under "Your day".)*
- [ ] Click the job → **Expect:** the full job detail page (customer, address, earnings, actions). The customer's phone is hidden until you're on the way.

### 3.3 Walk the job through to completion
- [ ] Click **Start journey** → **Expect:** *"you're on the way"*, the customer gets an email/SMS, and their phone number is now revealed.
- [ ] Click **I've arrived — begin work** → **Expect:** status becomes *in progress*.
- [ ] Click **Complete job & charge customer** → a **signature pad** opens → sign → **Expect:** *"Job complete — payment captured."*
  - **Sign-off gate test:** the job will **not** complete without a signature — if you somehow skip it you'll be told to capture the signature first.
- [ ] **Check Stripe → Payments** → **Expect:** the previously-uncaptured hold is now a **captured charge** (money actually taken).
- [ ] **Check Stripe → Connect → Transfers** → **Expect:** a transfer to the mechanic's connected account for their share (full price minus the platform fee).
- [ ] **Check the customer's email** → **Expect:** a receipt + a "rate your mechanic" prompt with star links.

### 3.4 Mechanic cancels their own job
- [ ] On a confirmed job, the mechanic chooses **cancel** with a reason → **Expect:** the job is re-offered to other mechanics, the customer's hold stays in place (not charged), and the customer is notified.

### 3.5 Add job photos
- [ ] On an active job, upload before/after **photos** → **Expect:** they upload (up to 10 MB each) and show on the job. The customer can see them.

---

## 4. Reviews & referrals

### 4.1 Leave a review
- [ ] As the customer, after a completed job, open the "rate your mechanic" link → leave a star rating + comment → **Expect:** it saves and appears on the mechanic's **Reviews** page; the mechanic's average rating updates.
- [ ] As the mechanic, respond to a review → **Expect:** your reply shows under the review.

### 4.2 Referral credit
- [ ] Get a customer's referral link → have a **new** customer sign up via it and complete their **first** booking → **Expect:** the referrer is granted account credit (and can see it on their account).
- [ ] On the new customer's next booking → **Expect:** available credit is offered/applied, reducing the amount charged.

---

## 5. Disputes

- [ ] As a customer or mechanic on an active/completed job, **raise an issue** → **Expect:** a dispute is opened and a 3-way thread (customer / mechanic / admin) is created.
- [ ] As admin, go to the disputes queue → open the dispute → **Expect:** you can read the thread and resolve it (including issuing a **refund** via Stripe if needed).
- [ ] After resolution → **Expect:** the parties are notified and the booking reflects the outcome.

---

## 6. Admin — running the platform

### 6.1 Oversight
- [ ] Log in as admin → dashboard → **Expect:** KPI cards and recent activity. *(A couple of metrics are deliberately placeholders — see section 8.)*
- [ ] Go to **Jobs** → **Expect:** every booking listed; open one to reassign, cancel, or view its timeline. CSV export works.

### 6.2 Services & pricing
- [ ] Go to **Services / Pricing** → add/edit a service, change a base price, change the commission rate, set an area multiplier → **Expect:** changes save and affect new booking prices.

### 6.3 Mechanics
- [ ] Go to **Mechanics** → **Expect:** the roster. You can flag/suspend a mechanic → **Expect:** a suspended mechanic stops receiving job offers (excluded from dispatch).

### 6.4 SMS credits (resold for profit)
- [ ] Go to **Admin → SMS** → **Expect:** a credit balance, "buy credits" packages (top up via GoCardless bank payment), a low-credit alert email, and a **Sender** section.
- [ ] In the **Sender** section → **Expect:** you can set the **sender name** only. There is **no "From number" field** — a note explains the sending number is managed centrally in backend config (`TWILIO_FROM`). *(This was just changed — see section 7.)*
- [ ] Send a **test SMS** (needs SMS enabled + at least 1 credit + Twilio configured) → **Expect:** one real text is sent and one credit is deducted; the balance drops by 1.
- [ ] Let the balance hit the low threshold → **Expect:** a one-time low-credit alert email.

---

## 7. What changed in this round of fixes (re-test these)

These were just fixed — worth a focused re-test:

- [ ] **Uploads over 1 MB now work** (onboarding docs, job photos, avatars). Try a ~5 MB photo.
- [ ] **The Schedule page is real** — it lists all your accepted jobs and links into each one (was a dead "coming soon" placeholder).
- [ ] **Job detail page opens** without the "Refs cannot be used in Server Components" crash.
- [ ] **Complete & charge works** — previously it failed with "That job no longer exists." It now captures payment and transfers the mechanic's share.
- [ ] **SMS "From number" field removed** — the sending number is backend-only now. *(Run the new DB migration `0027_sms_from_number_backend_only.sql` to drop the unused column.)*

---

## 8. Known placeholders (these are intentional — don't report as bugs)

You'll see a few "coming later" notes while testing. These are deliberate stubs:

Only one deliberate "coming soon" note remains in the app:

| Where | What it says | Status |
|---|---|---|
| Customer → Settings | "Saved cards and addresses coming soon" | Card is entered securely at booking time |

**Everything else has been wired or reworded** so the UI no longer advertises
incomplete work:
- **Admin dashboard KPIs** — **Take-rate** and **Avg time-to-accept** now show
  real figures (platform fee share of GMV; mean offer→accept time).
- **Admin → Live monitor** (`/admin/live`) — a real-time ops view: live-job KPIs,
  the live jobs table, mechanics-available panel, and a live activity feed
  (refreshes every 15s). Test it: with a job in progress and a mechanic online,
  open `/admin/live` → expect the counts, the mechanic, and recent events
  (accepts, captures, payouts) to all show and update.
- **Mechanic → Earnings** payouts — shows **real Stripe transfers** with a green
  "Live · paid via Stripe" badge once the mechanic is Stripe-connected.
- Admin Pricing / cancel / mechanics notes and the mechanic job-detail parts note
  were reworded to describe current behaviour instead of "lands in a later task".

### Sidebar
- [ ] Scroll a long page → **Expect:** the sidebar stays fixed (only the main
  content scrolls).
- [ ] Click **Collapse** at the bottom of the sidebar → **Expect:** it shrinks to
  an icon rail, labels hide, and the header logo swaps to the favicon. The choice
  persists across page loads. Click again to expand.
