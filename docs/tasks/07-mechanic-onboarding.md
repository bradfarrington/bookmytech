# Task 07 — Mechanic onboarding + admin approvals queue

**Status:** ✅ Complete (2026-06-04) — all three stages shipped. Public application wizard at `/mechanics/apply`, admin approvals queue at `/admin/approvals`, and documents management at `/mechanic/documents` + `/admin/documents`. Deviations: (1) Approve emails a **magic-link** sign-in (reusing Task 04's proven flow) rather than a temp-password-with-forced-reset — no reset screen exists, so this is more robust; (2) admin/mechanic pages live under their existing `(shell)` route groups (URLs unchanged: `/admin/approvals`, `/admin/documents`, `/mechanic/documents`). ⚠️ Apply migrations `0013`–`0015`; set `APP_ENCRYPTION_KEY` (bank encryption) and ideally `ADMIN_ALERT_EMAIL` + `CRON_SECRET` in prod.

Build the public-facing mechanic application flow ("become a BMT mechanic") and the admin approvals queue that processes those applications. Replaces the manual mechanic creation from task 04.

## Why this task

Right now mechanics are added by hand by an admin. That doesn't scale. The brief (sections 4 and 5) describes a proper application flow with document verification — two forms of insurance, qualifications, references — and an approvals queue where ops can review and approve / reject. Onboarding target is under 48 hours from application to approved. There are no DBS checks on this platform; mechanics are described as "vetted professionals" in all customer-facing copy.

## Three sub-stages

---

### Stage 1 — Public mechanic application flow

A multi-step form at `/mechanics/apply` for prospective mechanics.

**Steps:**

1. **About you** — name, email, phone, postcode, years of experience
2. **Your business** — sole trader / limited company, business name, UTR or company number, VAT registered (yes/no)
3. **Specialisms + service area** — what they work on (specialism multi-select), service radius preference
4. **Documents** — upload:
   - Photo ID (passport or driving licence)
   - Proof of public liability insurance (PDF or image)
   - Proof of trade insurance (PDF or image)
   - Trade qualification (NVQ, IMI, City & Guilds, etc.)
   - Bank account details (sort code + account number, encrypted at rest)
   - VAT registration document (if applicable)
   - Two professional references (name, relationship, email, phone)

   Note: DBS checks are not required and must not appear anywhere in the application flow or UI copy. Mechanics are described as "vetted professionals".
5. **Review + submit** — show everything they entered, submit button creates the application

**Schema:**

```sql
create table mechanic_applications (
  id uuid primary key default gen_random_uuid(),
  -- Step 1
  email text not null unique,
  full_name text not null,
  phone text not null,
  postcode text not null,
  years_experience integer,
  -- Step 2
  business_type text, -- 'sole_trader' | 'limited_company'
  business_name text,
  business_number text, -- UTR or company number
  vat_registered boolean default false,
  -- Step 3
  specialisms text[] default '{}',
  service_radius_miles integer default 10,
  -- Step 4 documents (Supabase Storage URLs)
  doc_photo_id text,
  doc_public_liability_insurance text,
  doc_trade_insurance text,
  doc_qualification text,
  doc_vat text,
  bank_sort_code_encrypted text,
  bank_account_number_encrypted text,
  -- References
  reference_1_name text, reference_1_email text, reference_1_phone text, reference_1_relationship text,
  reference_2_name text, reference_2_email text, reference_2_phone text, reference_2_relationship text,
  -- Status
  status text not null default 'submitted', -- 'submitted' | 'under_review' | 'approved' | 'approved_with_grace' | 'rejected' | 'needs_info'
  -- approved_with_grace = admin override: mechanic is live but has 28 days to supply outstanding docs
  grace_period_ends_at timestamptz, -- set when status='approved_with_grace'
  rejection_reason text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references profiles(id)
);
```

Bank details are encrypted at the application level using Supabase Vault (or a simple application-level encryption with a key stored in env). Don't store them as plain text under any circumstances.

**Acceptance criteria:**

- [x] `/mechanics/apply` route accessible without login (it's the entry point for new mechanics)
- [x] Five-step form with URL-driven state — `/mechanics/apply/step-1` ... `/mechanics/apply/review`
- [x] Each step validates before allowing progression
- [x] Documents upload to Supabase Storage with proper access policies (only applicant and admins can read)
- [x] Bank details encrypted before storage (use `crypto` for AES-256, key in env var, or Supabase Vault if you can get it working)
- [x] On submit: row inserted in `mechanic_applications` with status='submitted', confirmation email sent
- [x] Email confirmation to applicant: "Application received, we'll review within 48 hours"
- [x] Email alert to admins when a new application arrives

**Files touched:**
- `app/mechanics/apply/page.tsx` (or `/mechanics/apply/step-1/page.tsx` etc.)
- `app/mechanics/apply/_components/` (step components)
- `app/actions/submit-application.ts`
- `lib/crypto/encrypt.ts`
- `emails/application-received.tsx`
- `emails/admin-new-application.tsx`
- Schema migration

---

### Stage 2 — Admin approvals queue

The queue/detail split view from section 5 of the brief.

**Layout (`/admin/approvals`):**

- Left column: queue of submitted applications, sorted oldest first
  - Each card: applicant name, postcode, time since submitted, status pill
  - Click → loads into the right column
  - Filters: by status (submitted, under_review, needs_info, approved, rejected)
- Right column: detail view of the selected application
  - All applicant info (name, contact, business, specialisms)
  - Verification checklist with seven items:
    1. Photo ID
    2. Public liability insurance
    3. Trade insurance
    4. Trade qualification
    5. Bank account details
    6. VAT registration (if applicable)
    7. Two professional references
  - Each item:
    - Status indicator (pending / verified / failed)
    - "View" button → opens the document in a modal or new tab
    - Auto-screen note (e.g. "Insurance certificate expires Dec 2026 ✓")
  - Auto-screen summary at the top: "5 of 7 items auto-verified. 2 need manual review."
  - Four action buttons at the bottom: **Approve**, **Approve with 28-day grace**, **Reject**, **Request more info**
  - "Approve with 28-day grace" lets the admin accept the mechanic immediately despite outstanding documents, setting `status='approved_with_grace'` and `grace_period_ends_at = now() + 28 days`. The mechanic is live but a warning banner shows on their dashboard listing missing documents and the deadline. If the grace period expires without resolution, their account is auto-suspended from distribution.

**Auto-screening (basic for this task):**

- Public liability insurance: check the file exists and is < 5MB
- Trade insurance: check the file exists and is < 5MB
- ID: check the file exists
- Qualification: check the file exists
- Bank: check format (8-digit account, 6-digit sort code)
- References: check both email and phone are filled
- VAT: check file exists if vat_registered=true

True OCR-based verification is a future enhancement; for now, file presence + format checks are enough. Each item can be manually flipped to verified by the admin after viewing.

**On Approve:**

- Create `auth.users` entry with the applicant's email and a generated password
- Create `profiles` row with role='mechanic'
- Create `mechanics` row with the application's specialisms, radius, postcode
- Send approval email with login link and a temporary password (forces reset on first login)
- Update application status='approved'

**On Reject:**

- Update application status='rejected' with reason
- Send rejection email with reason
- No `auth.users` created

**On Request more info:**

- Update application status='needs_info' with a note
- Send email to applicant explaining what's needed
- Applicant can resubmit specific docs via a unique link in the email

**Acceptance criteria:**

- [x] `/admin/approvals` queue/detail split layout
- [x] All seven verification items render with view/verify controls
- [x] Approve action creates auth user + profile + mechanic and sends email
- [x] Reject action with mandatory reason
- [x] Needs-info flow with a public resubmit link
- [x] Filter tabs working
- [x] Documents open securely (Supabase Storage signed URLs, 1-hour expiry)

**Files touched:**
- `app/(admin)/admin/approvals/page.tsx`
- `app/(admin)/admin/approvals/_components/queue.tsx`
- `app/(admin)/admin/approvals/_components/detail.tsx`
- `app/(admin)/admin/approvals/_components/verification-checklist.tsx`
- `app/actions/approvals.ts` (approve, reject, requestInfo)
- `app/mechanics/resubmit/[token]/page.tsx` (resubmit flow)
- `emails/application-approved.tsx`, `application-rejected.tsx`, `application-needs-info.tsx`
- `lib/auto-screen/checks.ts`

---

### Stage 3 — Documents management for active mechanics

Once approved, mechanics need to keep documents up to date (insurance renewals, DBS re-checks, etc.).

**`/mechanic/documents`:**

- List of documents on file with expiry dates
- Warning indicators if anything is expired or expiring within 30 days
- Upload replacement for any document
- Recently-replaced docs go into admin approval queue automatically

**`/admin/documents`:**

- View of all mechanics' documents
- Filter by expiring soon, expired, needs review
- Approve replacement documents

**Schema:**

```sql
create table mechanic_documents (
  id uuid primary key default gen_random_uuid(),
  mechanic_id uuid not null references mechanics(id) on delete cascade,
  doc_type text not null, -- 'public_liability_insurance' | 'trade_insurance' | 'qualification' | 'id' | 'vat'
  file_url text not null,
  expires_at date,
  status text not null default 'pending_review', -- 'pending_review' | 'verified' | 'rejected' | 'expired'
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references profiles(id)
);
```

**Acceptance criteria:**

- [x] Mechanic documents page with expiry warnings
- [x] Admin documents page with filtering
- [x] Replacement flow: mechanic uploads, document enters pending_review, admin approves/rejects
- [x] Email alert to mechanic 30 days before expiry, then 7 days, then on expiry day
- [x] If a document expires and isn't replaced, mechanic auto-set to offline (can't receive new jobs until docs current)

**Files touched:**
- `app/(mechanic)/mechanic/documents/page.tsx`
- `app/(admin)/admin/documents/page.tsx`
- `app/actions/documents.ts`
- Cron / scheduled function for expiry checks
- Schema migration

## What NOT to do in this task

- Don't build full OCR-based document verification — file presence + format checks are enough
- Don't integrate with a third-party DBS / Companies House API — manual review is fine for this task
- Don't build a mechanic CRM with notes, calls, etc. — just the application + approval flow
- Don't build automated reference-checking — admin manually contacts references for now

## When complete

- Update `docs/HANDOFF.md`:
  - Mark task 07 ✅ Complete
  - Set current task to `08-pricing-and-stripe-connect.md`
- Commit and push
