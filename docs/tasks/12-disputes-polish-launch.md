# Task 12 — Disputes, refunds, polish, launch prep

**Status:** 🟡 In progress — **Stage 1 (disputes) ✅ complete (2026-06-05)**, migration `0025`. **Stage 2 (polish) 🟡 partially complete (2026-08-26)**: error boundaries, loading skeletons, the branded 404 and both missing legal pages shipped; **mechanic no-show auto-detection and the empty-state / a11y / Lighthouse sweeps are still outstanding** (no-show deferred by owner decision). Stages 3–4 (operational readiness / launch checklist) not started — much of 3–4 is third-party accounts + founder ops rather than code. ⚠️ Apply migration `0025`; the Stripe refund / payout-reversal paths weren't live-fired (see Stage 1 notes).

The final task before public launch. Build dispute resolution end-to-end, polish the rough edges across the platform, and complete launch-readiness items.

## Why this task

By now the platform works — bookings flow, mechanics get paid, customers track jobs, ops have visibility. But shit happens: customers will be unhappy, mechanics will disagree, payments will need refunding. Without a structured dispute flow, these become founder-level escalations that don't scale.

This task also covers the launch polish — accessibility audit, performance pass, error states, empty states, and operational readiness.

## Four sub-stages

---

### Stage 1 — Disputes resolution flow

Disputes are raised by the customer from their job list on the customer dashboard. They are visible to the admin and to the mechanic assigned to the disputed booking. The admin monitors all correspondence but acts only as mediator — they intervene only if the parties cannot resolve it themselves. BMT is the named mediator. Disputes start with the involved parties and escalate to admin only if unresolved.

**Customer-initiated dispute:**

After a completed booking, customer has 48 hours to flag a problem. From the "Raise dispute" button on the past jobs list in their dashboard:

- Reason categories: Workmanship · Parts cost · Price · Mechanic conduct · Damage · Other
- Description (required, min 30 chars)
- Photos (optional, up to 6)
- Refund request — full, partial (with amount), or "not after a refund, just want to flag this"

Status: 'opened'. Booking status flips to 'disputed'. Stripe payment held (don't transfer to mechanic until resolved). A notification is sent to both the admin team and the assigned mechanic.

**Mechanic-initiated dispute:**

Less common but happens — mechanic does the work, customer disputes payment or refuses to sign off. Mechanic can flag from the in-progress flow or job detail:

- Reason: Customer refuses to sign off · Customer abusive · Disputed scope of work · Other
- Description + photos
- Status: 'opened', booking status='disputed'

**Resolution flow (per dispute):**

1. **Opened** — other party gets 48h to respond
2. **Responded** — other party adds their account + photos
3. **Negotiating** — parties can exchange messages in-app (uses existing `messages` table scoped to the dispute)
4. **Resolved by parties** — either side accepts the other's resolution (refund, no refund, partial)
5. **Escalated to admin** — if no agreement in 48h after responded
6. **Admin arbitration** — admin reviews, makes binding decision
7. **Closed** — final state

**Admin arbitration UI (`/admin/disputes/[id]`):**

- Full case file: booking, customer account, mechanic account, all messages, all photos, payment status
- Admin sees ALL correspondence between the parties throughout the dispute lifecycle
- "Suggested resolution" surfaced by simple rules (e.g. mechanic rating ≥ 4.8 and customer first booking → lean customer benefit-of-doubt; otherwise neutral)
- Decision: Full refund · Partial refund (£) · No refund · Compensation credit · Account action
- Reason + customer-facing explanation
- Auto-actions on resolution:
  - Refund via Stripe (full or partial)
  - Credit issued via `customer_credits`
  - Mechanic flag (performance issue, repeated offences can lead to suspension)
  - Email both parties with outcome

**Mechanic account suspension (`/admin/mechanics/[id]`):**

Accessible from the mechanic detail page and from the dispute arbitration UI. Admin can:
- Suspend a mechanic's account with a recorded reason and a defined end date (or indefinite pending review)
- Suspended mechanics are immediately removed from all new job offer distribution — the dispatch function skips mechanics where `suspended_until > now()` or `is_suspended = true`
- Suspension history is retained on the mechanic's profile in admin
- Mechanic receives an email explaining the suspension, reason, and (if applicable) end date
- When suspension lifts (either the end date passes or admin manually un-suspends), mechanic re-enters the distribution automatically

**Schema:**

```sql
create table disputes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  opened_by uuid not null references profiles(id),
  opened_by_role text not null, -- 'customer' | 'mechanic'
  reason_category text not null,
  description text not null,
  photos text[] default '{}',
  refund_requested_pence integer, -- nullable for non-refund disputes
  status text not null default 'opened',
  responded_at timestamptz,
  escalated_at timestamptz,
  resolved_at timestamptz,
  resolution text,
  resolution_refund_pence integer,
  resolution_credit_pence integer,
  resolved_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table mechanic_flags (
  id uuid primary key default gen_random_uuid(),
  mechanic_id uuid not null references mechanics(id) on delete cascade,
  flag_type text not null, -- 'dispute_loss' | 'low_rating' | 'low_acceptance' | etc.
  severity text not null default 'low', -- 'low' | 'medium' | 'high'
  related_dispute_id uuid references disputes(id),
  notes text,
  created_at timestamptz not null default now()
);

create table mechanic_suspensions (
  id uuid primary key default gen_random_uuid(),
  mechanic_id uuid not null references mechanics(id) on delete cascade,
  reason text not null,
  suspended_by uuid not null references profiles(id),
  suspended_at timestamptz not null default now(),
  suspended_until timestamptz, -- null = indefinite until manually lifted
  lifted_at timestamptz,
  lifted_by uuid references profiles(id)
);

-- Add suspension state to mechanics table
alter table mechanics add column is_suspended boolean not null default false;
alter table mechanics add column suspended_until timestamptz;
```

**Mechanic performance flags:**

Mentioned in the live monitor's "needs attention" panel (task 04). Wire it up properly here:

- 3+ disputes lost in 30 days → high severity flag, mechanic suspended pending review
- Avg rating drops below 4.0 → medium flag
- Acceptance rate below 70% → low flag
- Visible in admin mechanic detail with action buttons (warn, suspend, terminate)

**Acceptance criteria:**

- [x] Customer can open dispute from "Raise dispute" button on past jobs list within 48 h of completion — replaces the mailto stub; `/dashboard/disputes/new/[bookingId]` → `openDispute`.
- [x] Mechanic can open dispute from job detail — "Raise an issue" on the mechanic job detail → `/mechanic/disputes/new/[bookingId]`.
- [x] In-app message thread per dispute — admin sees all correspondence — `dispute_messages` (3-party: customer / mechanic / admin mediator), shared `DisputeThread` (polling, RLS read).
- [x] Notification sent to admin and assigned mechanic when dispute is opened — emails to `ADMIN_NOTIFY_EMAIL` + the other party.
- [x] Stripe payment hold on opened dispute — `openDispute` reverses the mechanic's transfer (if already paid at completion) and sets `disputes.payout_held`.
- [x] 48 h auto-escalation to admin — `/api/cron/escalate-disputes` (hourly): opened >48h or responded >48h → escalated. Parties can also escalate manually.
- [x] Admin arbitration UI with case file + decision flow — `/admin/disputes` queue + `/admin/disputes/[id]` (booking/customer/mechanic facts, payment status, suggested-resolution rule, thread, decision panel).
- [x] Refund via Stripe API on resolution — `lib/stripe/refund.ts`; `resolveDispute` refunds the card.
- [x] Customer credits on partial refunds — compensation credit via `grantCredit` (source `compensation`).
- [x] Mechanic flags created on lost disputes — `mechanic_flags` (`dispute_loss`); 3+ losses in 30 days auto-suspends.
- [x] Admin can suspend mechanic from `/admin/mechanics/[id]` or dispute UI — `SuspensionControls` on the mechanic detail (reachable from arbitration via the mechanic link); `suspendMechanic` with reason + optional end date.
- [x] Suspended mechanic immediately excluded from dispatch — `dispatchBooking` skips active suspensions (`is_suspended` + `suspended_until` check); suspend also sets `status='offline'`.
- [x] Suspension email + auto-lift — email on suspend/lift; `/api/cron/lift-suspensions` (daily) clears expired ones, and dispatch already treats an expired suspension as inactive.
- [x] Suspension history visible on mechanic profile — `mechanic_suspensions` listed on the admin mechanic detail.
- [x] Email notifications at every status change — open / responded / escalated / resolved / withdrawn / suspend / lift all email the relevant parties.
- [x] Counters in admin "needs attention" panel — open-disputes counter already wired in the overview's needs-attention panel; disputed bookings feed it. (KPI strip not expanded — the panel is the surface.)

**Implementation notes / deviations:**
- **Party self-resolution = the opener withdraws** (satisfied / sorted). Anything money-bearing (refund / partial / credit) is **admin-executed** in arbitration — a mechanic can't move money, so binding outcomes are admin-gated. Full propose/counter/accept between parties was not built (deliberate simplification).
- **Refund accounting:** refunds come out of the **mechanic's payout first**, then the platform fee. On open we reverse the payout transfer; on resolve we re-transfer `max(0, payout − refund)`.
- **Crons are Next API routes** (`escalate-disputes` hourly, `lift-suspensions` daily) + `vercel.json`, not Supabase edge functions (project convention).
- **rating<4.0 / acceptance<70% auto-flags** (from the prose) are **deferred** to a future nightly metrics job — only the explicit "flag on lost disputes" + the 3-losses auto-suspend are built. The overview perf-flags panel already surfaces rating<4 live.
- ⚠️ Migration `0025`. The **Stripe refund + transfer-reversal + re-transfer paths were not live-fired** (no running app/keys) — build + 39 unit tests pass; exercise a real dispute resolution before relying on the money movements.

**Files touched:**
- `app/(customer)/dashboard/disputes/new/[booking-id]/page.tsx`
- `app/(customer)/dashboard/disputes/[id]/page.tsx`
- `app/(mechanic)/mechanic/disputes/new/[booking-id]/page.tsx`
- `app/(mechanic)/mechanic/disputes/[id]/page.tsx`
- `app/(admin)/admin/disputes/page.tsx` (queue)
- `app/(admin)/admin/disputes/[id]/page.tsx` (arbitration)
- `app/actions/disputes.ts`
- `lib/stripe/refund.ts`
- `supabase/functions/escalate-disputes/index.ts` (cron, runs hourly)
- Schema migration

---

### Stage 2 — Polish: error states, empty states, loading, edge cases

A pass across the whole app fixing the rough edges.

**Areas to cover:**

- [x] **Every async fetch** has a loading skeleton — `loading.tsx` at the customer dashboard, the admin shell and the mechanic shell, built on a shared `Skeleton` primitive (`components/ui/skeleton.tsx`). These are the three dynamic areas; per-page skeletons below them are still open.
- [ ] **Every list** has a meaningful empty state ("No bookings yet — book your first" with CTA)
- [ ] **Every form** has clear error messages, both field-level and form-level
- [x] **Every error boundary** — `app/global-error.tsx` (root; it REPLACES the root layout, so it carries its own `<html>`/`<body>` and inline styles rather than relying on Inter or the design tokens) plus five per-section boundaries: `(customer)`, `(customer)/book`, `(customer)/dashboard`, admin shell, mechanic shell. All share `components/ui/error-state.tsx` and surface `error.digest` so a support call can be matched to a server log. **Next 16 renamed the reset prop to `unstable_retry`** — `reset` silently does nothing.
- [x] **404 page** — `app/not-found.tsx`, branded, returns a real 404, with a primary "Book a repair" CTA and four suggested destinations. **Deliberately does NOT embed the hero's reg lookup**: submitting it spends money (DVLA VES + DVSA MOT bill per call) and 404s are exactly what crawlers and scanners hit.
- [ ] **Network failure handling** — retry buttons where appropriate, queued actions where offline (already done for mobile PWA in task 06)
- [ ] **Stripe failures** — clear customer-facing messages, support contact info
- [ ] **DVLA failures** — fallback to manual vehicle entry, no dead-ends
- [ ] **Cancel flows** — customer cancellation fees are sourced from `platform_settings` at cancellation time: more than 24 h before slot → £0; within 24 h → £30 (configurable); mechanic already en route → £50 (configurable). The fee is charged from the pre-authorised deposit; the remainder is released. The cancel/reschedule UI is built in task 09.
- [ ] **Mechanic no-show** — automatic if mechanic hasn't updated status to 'en_route' within 30 min of slot. Re-dispatches to backup mechanic, customer notified, original mechanic flagged. **Explicitly deferred by owner 2026-08-26** — still to build.
- [x] **Cancellation policy** — `/cancellation-policy`, linked from the footer and from the checkout step of the booking funnel. The three tiers are read **live** from `platform_settings` via the now-exported `cancelFeeTiers()`, the same function `cancelBooking` charges from, so the published policy cannot drift from what a customer is actually charged. The page is `force-dynamic` for that reason.

**Acceptance criteria:**

- [x] All async boundaries have suspense / skeleton — at AREA level (dashboard, admin shell, mechanic shell). Per-page skeletons beneath those are deferred.
- [ ] No screen renders empty without a meaningful empty state
- [ ] Cancellation flow built per the rules above
- [ ] Mechanic no-show auto-detection edge function
- [x] Public legal / policy pages: Terms of Service, Privacy Policy, Cancellation Policy, Mechanic Agreement — the last two shipped 2026-08-26 (`/cancellation-policy`, `/mechanic-agreement`), both on the shared `LegalPage` chrome.
- [ ] Accessibility audit: keyboard-navigable, proper ARIA labels, colour contrast ≥ AA, all forms have associated labels
- [ ] Lighthouse: Performance ≥ 85, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95 on key pages

---

### Stage 3 — Operational readiness

Things the business needs before going live.

**Customer support:**

- Help centre at `/help` — FAQ articles organised by topic
- Live chat integration (Intercom, Crisp, or custom) — placeholder if not decided
- Support email surfaced everywhere: `help@bookmytech.co.uk`
- Saved replies for common queries in admin (built into a `/admin/support` view if doing properly, otherwise email-only is fine for launch)

**Email + SMS templates audit:**

- Every transactional email reviewed for content, branding, mobile rendering
- SMS templates kept short (under 160 chars where possible) and clear
- All include unsubscribe link (for marketing) or "manage notifications" link (for transactional)
- Test rendering across Gmail, Outlook, Apple Mail, mobile clients

**Onboarding nudges:**

- New customer: post-signup welcome email with how-it-works
- New mechanic: post-approval welcome with first-job tips
- Stalled bookings: if customer started but didn't finish, gentle reminder 24h later (one-off, no spam)

**Analytics + monitoring:**

- Real product analytics — pick one: Posthog (recommended, self-hostable), Plausible, or Mixpanel
- Error monitoring — Sentry (free tier is fine to start)
- Uptime monitoring — Better Stack or similar, pinging key routes
- Daily ops digest email to founders: bookings, GMV, mechanic count, support tickets

**Acceptance criteria:**

- [ ] `/help` with at least 10 FAQ articles
- [ ] Live chat or email support clearly accessible from every page
- [ ] All transactional emails / SMS templates reviewed and tested
- [ ] Sentry installed for both frontend and backend errors
- [ ] Posthog (or alternative) installed with key events instrumented
- [ ] Uptime monitoring set up on `/`, `/book`, `/admin`, `/mechanic`
- [ ] Daily ops digest cron job
- [ ] Public pages: About, Contact, Press, Careers (or placeholders)

---

### Stage 4 — Launch checklist

Final items before going live to real customers.

- [ ] Production Stripe account (not test mode) — get keys, configure webhooks
- [ ] Production DVLA API access (separate from dev key)
- [ ] Production Google Maps key with billing alerts
- [ ] Production Twilio + Resend with sender domain verified
- [ ] Custom domain set up on all three Vercel projects (`bookmytech.co.uk`, `mechanic.bookmytech.co.uk`, `admin.bookmytech.co.uk`)
- [ ] SSL certificates active
- [ ] Database backups configured in Supabase (point-in-time recovery enabled on Pro plan)
- [ ] Rate limiting on auth endpoints (already provided by Supabase, verify config)
- [ ] Spam protection on signup (hCaptcha or similar)
- [ ] Pen-test minimum: at least manual SQL injection / XSS testing of forms
- [ ] GDPR compliance: privacy policy, data deletion request flow, audit of where personal data lives
- [ ] PCI compliance: confirmed by Stripe Connect handling all card data, no PII in logs
- [ ] Insurance: confirm business has professional indemnity and public liability cover
- [ ] Founder admin training: a 1h walkthrough of the admin console, dispute resolution, common ops scenarios
- [ ] Mechanic onboarding day-one playbook: how to invite the first 10–20 mechanics, what to communicate
- [ ] Customer launch comms: prepared content for the first 100 customers, channels for reaching them

## What NOT to do in this task

- Don't over-engineer support — email + simple help centre is fine for launch
- Don't build a marketing CMS — public pages can be hardcoded for launch
- Don't add AI features — out of scope for v1
- Don't try to handle every conceivable edge case — focus on the obvious ones, iterate post-launch

## When complete

🚀 The platform is launch-ready.

- Update `docs/HANDOFF.md` to reflect launch state — all primary tasks complete, future work goes into a separate backlog doc.
- Consider creating `docs/backlog.md` for post-launch features (calendar sync, fleet contracts, insurance partnerships, native iOS/Android — all phase 5 in the brief).
- Tag the release: `git tag v1.0.0 && git push --tags`

After launch, the work shifts to operations, customer support, mechanic recruitment, and iterating based on real usage data. The codebase is in a good state to keep building.
