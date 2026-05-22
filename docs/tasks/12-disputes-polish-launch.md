# Task 12 — Disputes, refunds, polish, launch prep

**Status:** ⏳ Queued

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

- [ ] Customer can open dispute from "Raise dispute" button on past jobs list within 48 h of completion
- [ ] Mechanic can open dispute from job detail
- [ ] In-app message thread per dispute — admin sees all correspondence
- [ ] Notification sent to admin and assigned mechanic when dispute is opened
- [ ] Stripe payment hold on opened dispute (don't transfer to mechanic)
- [ ] 48 h auto-escalation to admin
- [ ] Admin arbitration UI with case file + decision flow
- [ ] Refund via Stripe API on resolution
- [ ] Customer credits on partial refunds
- [ ] Mechanic flags created on lost disputes
- [ ] Admin can suspend mechanic from `/admin/mechanics/[id]` or dispute UI, with reason + optional end date
- [ ] Suspended mechanic immediately excluded from dispatch; `mechanics.is_suspended = true` and `suspended_until` checked in dispatch function
- [ ] Suspension email sent to mechanic; auto-lift when `suspended_until` passes (cron or check on dispatch)
- [ ] Suspension history visible on mechanic profile in admin
- [ ] Email notifications at every status change
- [ ] Counters in admin "needs attention" panel and overview KPIs

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

- [ ] **Every async fetch** has a loading skeleton (use Suspense boundaries)
- [ ] **Every list** has a meaningful empty state ("No bookings yet — book your first" with CTA)
- [ ] **Every form** has clear error messages, both field-level and form-level
- [ ] **Every error boundary** — global error boundary at root, per-section error boundaries for admin/mechanic/customer
- [ ] **404 page** — branded, with search and home link
- [ ] **Network failure handling** — retry buttons where appropriate, queued actions where offline (already done for mobile PWA in task 06)
- [ ] **Stripe failures** — clear customer-facing messages, support contact info
- [ ] **DVLA failures** — fallback to manual vehicle entry, no dead-ends
- [ ] **Cancel flows** — customer cancellation fees are sourced from `platform_settings` at cancellation time: more than 24 h before slot → £0; within 24 h → £30 (configurable); mechanic already en route → £50 (configurable). The fee is charged from the pre-authorised deposit; the remainder is released. The cancel/reschedule UI is built in task 09.
- [ ] **Mechanic no-show** — automatic if mechanic hasn't updated status to 'en_route' within 30 min of slot. Re-dispatches to backup mechanic, customer notified, original mechanic flagged.
- [ ] **Cancellation policy** — public page at `/cancellation-policy`, linked from booking flow, showing the three fee tiers

**Acceptance criteria:**

- [ ] All async boundaries have suspense / skeleton
- [ ] No screen renders empty without a meaningful empty state
- [ ] Cancellation flow built per the rules above
- [ ] Mechanic no-show auto-detection edge function
- [ ] Public legal / policy pages: Terms of Service, Privacy Policy, Cancellation Policy, Mechanic Agreement
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
