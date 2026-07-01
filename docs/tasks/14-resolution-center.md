# Task 14 — Resolution Center (mechanic ↔ admin)

**Status:** ✅ Complete (2026-07-01) — internal mechanic↔admin case system shipped end-to-end; migration `0032`. Not live-fired against a running app this session.

An **internal** channel for mechanics and admins to raise and work issues about a
specific job — e.g. "I can't complete this job, please redistribute it." It is
deliberately separate from the customer-facing **disputes** system (Task 12 /
`0025`): 2-party (mechanic + admin) only, **never visible to or notifying the
customer**, jobs picked from a dropdown, reasons **configured in admin**, and
geared toward the admin **redistributing** the job. The only customer contact is
an admin-initiated email/SMS sent from the case workbench.

---

## Data model (`0032_resolution_center.sql`)

- **`resolution_reasons`** — admin-configurable reason list (label, active,
  sort_order). RLS SELECT for mechanics+admins only (no customer access); writes
  via service-role after an admin check. Seeded with 7 defaults, soft-delete via
  `active=false`. Unique on `label`.
- **`resolution_cases`** — one row per raised case (NOT unique per booking; many
  allowed). Snapshots `reason_label` so reason edits don't rewrite history. RLS:
  mechanic reads own (`mechanic_id`/`opened_by = auth.uid()`), admin reads all;
  no customer policy.
- **`resolution_messages`** — internal 2-party thread (mechanic + admin roles
  only). RLS scoped to the case's mechanic + admins.
- **`booking_events`** — added `resolution_opened` + `resolution_redistributed`
  event types (constraint rebuilt idempotently, same shape as `0025`).

**Acceptance criteria:**
- [x] Reasons are admin-configurable (CRUD at `/admin/resolutions/reasons`).
- [x] Cases are internal-only — no customer route, page, RLS policy, or notification.
- [x] A mechanic can only raise/read/post on their own assigned jobs (RLS + action guards).
- [x] Admin can redistribute (re-broadcast) and message the customer (template or manual).
- [x] Both areas reachable: mechanic "Get help" nav + admin "Resolution Center" nav.

---

## Server actions (`app/actions/resolutions.ts`)

`requireStaff()` (mechanic|admin) + `requireAdmin()` guards; all writes via the
service-role client. `openResolutionCase`, `postResolutionMessage`,
`updateResolutionStatus`, `redistributeFromCase` (mirrors the cancel+rebroadcast
in `mechanic-jobs.ts`, calls `dispatchBooking`), `sendCaseCustomerEmail` /
`sendCaseCustomerSms` (template via `renderTemplateEmail` / `renderSmsTemplate`,
or manual), and reason CRUD (`saveResolutionReason` / `deleteResolutionReason`).

- [x] Redistribute unassigns → `sourcing_mechanic` → `dispatchBooking`, logs a booking event, marks the case `redistributed`.
- [x] Customer email/SMS each independently optional; every send logged as an admin note on the case thread.
- [x] Opening a case notifies **staff only** (admin team always; the mechanic when an admin raised it) via **configurable** templates `resolution_opened_admin` / `resolution_opened_mechanic` (editable at `/admin/emails`). The customer is never notified of a case.

---

## UI

**Mechanic** (`app/(mechanic)/mechanic/(shell)/resolutions/`): "Get help" nav item
(`components/mechanic/nav-items.ts`, `LifeBuoy`), list, `new` (job + reason
dropdowns via the `Select` primitive + description), and `[id]` detail with the
internal thread + close-case control.

**Admin** (`app/(admin)/admin/(shell)/resolutions/`): "Resolution Center" nav item
(Operations group), list (job / mechanic / reason / status), `[id]` workbench
(job+parties summary, description, redistribute + status controls, customer-comms
panel, internal thread), and `reasons/` CRUD editor.

Shared components in `components/resolutions/` (case-form, case-thread,
admin-actions, customer-comms, status-pill, close-case-button); shared loaders in
`lib/resolutions/load.ts`; constants in `lib/resolutions/constants.ts`.

- [x] Mechanic job dropdown lists any job assigned to them.
- [x] Reason dropdown reflects only active reasons.
- [x] Customer-comms email picker filtered to `category: 'customer'` templates; SMS picker from all SMS templates; both offer a manual option.

---

## What NOT to do in this task
- Don't touch the customer-facing `disputes` system — this is a parallel concern.
- Don't add any customer route, view, email, or notification about a case itself. The customer is only ever contacted by an explicit admin send.
- Don't hardcode reasons — they live in `resolution_reasons` and are admin-managed.

## When complete
- ⚠️ **Apply migration `0032`** before testing.
- Update `docs/HANDOFF.md` (done).
- Commit and push.
