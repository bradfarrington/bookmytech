# Task 22 — SMS for every booking-time event, and per-template on/off switches

**Status:** ✅ Complete (2026-09-03) — code complete on branch `task-21-22-arrival-window-notifications`, alongside Task 21. **Migration `0053` is NOT yet applied** (Brad applies it); until it is, every switch reads as ON (the gate fails open) and the admin switches error on save. **Not yet fired against Twilio** — none of the new texts has been sent to a real number (there are no live Twilio credentials in dev; Task 13's touchpoints were in the same position).

## Why this exists

While confirming how the customer should hear about Task 21's arrival window, Brad found that texts only went out for booking received, on the way, complete, cancelled, message fallback and reminders. Every time-related event — the mechanic accepting, proposing a new time, the customer's own reschedule, a mechanic dropping out — was email-only, and he'd assumed those were already texting. Task 13's own catalogue (`docs/tasks/13-final-integrations.md` → touchpoint #4) listed "reschedule confirmations" as intended scope and never wired them.

He also asked for a way to switch each text, and each email, off individually — "in the settings". This task reads that as **admin-level switches** (global, on the template editors), not per-customer preferences; per-customer preferences would be a separate task.

## Owner decisions (Brad, 2026-09-03)

Text for: **customer "mechanic confirmed"** (accept, replacement accept, admin hand-assign); **customer time changes** (mechanic proposed a new time, their own reschedule confirmed, "finding you a replacement"); and **the mechanic's side** (customer cancelled, customer moved the slot, proposal accepted / declined). Dispute emails stay email-only.

## What shipped

### Ten new SMS templates (`lib/sms/templates.ts`)

The registry gained an `audience: "customer" | "mechanic"` field. Every key appears in `/admin/sms/templates` automatically (the page iterates the registry — no seeding), grouped by audience.

| key | to | fires from |
|---|---|---|
| `mechanic_confirmed` / `replacement_confirmed` | customer | `acceptOffer`, and **`reassignMechanic`** (admin hand-assign — which used to send only a push, so a guest customer learned nothing at all; it now sends the same email + text as accept) |
| `arrival_window_confirmed` | customer | `setArrivalWindow` (Task 21) |
| `mechanic_proposed_time` | customer | `proposeReschedule` — links to `/book/confirmed/[id]`, which carries the accept/decline banner and works for guests |
| `booking_rescheduled` | customer | `rescheduleBookingFor` (web **and** the mobile reschedule route, because both call the shared core) |
| `finding_replacement` | customer | `cancelOwnJob` |
| `mech_job_cancelled` | mechanic | `cancelBookingFor` |
| `mech_booking_rescheduled` | mechanic | `rescheduleBookingFor` |
| `mech_reschedule_accepted` / `mech_reschedule_declined` | mechanic | `respondToRescheduleFor` |

Mechanic texts are the first mechanic-facing templates; `mechanicPhone()` (beside `mechanicEmail()` in `lib/bookings/manage-booking.ts`) reads `profiles.phone`, the same column the unread-message sweep already texts. The resolution-case "Notify the customer" picker is filtered to customer-audience templates that are switched on.

**Cost note.** Texts are one credit each regardless of length, but a body outside GSM-7 (curly quotes, en/em dashes, the "·" in our slot labels) drops to 70 characters per segment. `gsmFriendly()` transliterates those in `sendSms` — "Wed 3 Sep · 8am–10am" goes out as "Wed 3 Sep, 8am-10am" — and the editor preview shows the transliterated form. Admin overrides get the same treatment.

### The switches

**Storage — `notification_toggles` (migration `0053`)**: `(channel, key, enabled)`, service-role only, a key with no row is ON. Deliberately **not** a column on `sms_templates` / `email_templates`: those are overrides-only tables where "Reset to default" is a `DELETE`, so an `enabled` flag there would be wiped by a reset.

**Gate — `lib/notifications/toggles.ts`**: `isNotificationEnabled(channel, key)`, one bulk read of the disabled set cached per instance for 60 s (the same shape as `loadLimits` in the rate limiter). **Fails open**: an unreadable table means "enabled", and the failure isn't cached. An admin flip clears the flipping instance's cache at once and reaches the others within a minute.

**Enforcement at the two choke points, with zero call-site churn:**
- **Email** — `renderTemplateEmail` returns `SKIPPED_EMAIL` (`{ subject: "", html: "" }`) for a switched-off key, and `sendEmail` drops an empty `html`. That covers all ~40 render sites, including the `emails/*.ts` wrappers; `previewTemplateEmail` stays ungated so an admin can still preview a disabled template.
- **SMS** — `getSmsTemplateBody` returns `""` for a switched-off key, and `sendSms` refuses an empty body **before** `reserve_sms_credit()`, so a switched-off text never spends a credit. That covers `renderSmsTemplate` and the two crons that resolve a body once per batch.

**Locked on** (`lib/notifications/locked.ts`): `password_reset` and every `category: "internal"` email. Switching off a password reset would lock customers out; switching off an admin alert would hide a problem from the people meant to fix it. The editor shows "Always on" instead of a switch and the action refuses.

**Admin UI**: a shared `components/ui/switch.tsx` (the pill switch lifted out of the SMS panel, which now uses it too). `/admin/sms/templates` — switch beside the Customised/Default pill, cards grouped Customer / Mechanic, an "Off" pill and dimmed card when off. `/admin/emails` — the collapsed header was one big `<button>`, so the switch sits **beside** it as a sibling, never inside (a tap on the switch mustn't also expand the card). Actions: `setSmsTemplateEnabled`, `setEmailTemplateEnabled`.

## How to verify (once `0053` is applied)

1. `/admin/sms/templates` shows two groups and every template on. Switch **Mechanic confirmed** off → "Off" pill. `/admin/emails` → switch **Mechanic confirmed** off too; **Password reset** and the internal alerts show "Always on".
2. Accept a job as a mechanic → **no** email and **no** text to the customer, the push still arrives, and `sms_settings.sms_credits_balance` is unchanged.
3. Switch both back on; accept another job → email + push + text within a minute.
4. Preview a switched-off email template: still renders.
5. As a customer, reschedule from the dashboard (and from the app via `POST /api/mobile/v1/bookings/[id]/reschedule`): the mechanic gets the "customer moved job #…" text and the customer gets "now set for …".
6. As a mechanic, propose a new time: the customer's text carries the confirmation-page link; accept it as a guest from that page: the mechanic gets the "accepted" text.
7. Cancel as a customer: the mechanic gets the "cancelled" text alongside the existing email.

## Acceptance criteria

- [x] Texts on: mechanic confirmed (accept / replacement / admin assign), arrival window, proposed time, customer reschedule, finding replacement
- [x] Mechanic texts on: customer cancelled, customer moved the slot, proposal accepted / declined
- [x] Admin hand-assign also sends the "mechanic confirmed" email it never sent
- [x] Every SMS and email template has an admin on/off switch, except locked ones
- [x] A switched-off text costs no credit; a switched-off email is never rendered or sent
- [x] Reset-to-default never re-enables a switched-off template
- [x] New keys appear in the editors and the resolution-case picker without seeding
- [x] Slot labels transliterated to GSM-7 before sending
- [x] Unit tests: `interpolateTemplate`, `gsmFriendly`, registry integrity (unique keys, every token declared)
- [ ] Fired against a real number — **deferred**, no live Twilio credentials in dev

## Follow-ups

- **Per-customer notification preferences** (a customer choosing not to get texts) — not built; the switches are global. The reminders opt-in (`profiles.reminder_via_sms`) is the only per-customer flag today.
- **Guest bookings still have no phone** (Task 13's standing gap), so their texts are silently skipped.
- **The 10-credit low-balance alert is now low**: a booking that's accepted, narrowed, rescheduled and completed sends ~7 texts.
- **`sms_log` has no `booking_id` / `template_key`**, so "did this booking get its text?" still can't be answered from the log.
- **No dedup or rate limit**: a mechanic cancelling and a replacement accepting within minutes sends two texts in quick succession. Correct, but worth watching.

## Mobile app (per AGENTS.md)

- **Migration `0053`** — a new service-role-only table; `npm run db:types` in the app. Nothing the app reads changes.
- No request or response shape changed. The mobile reschedule and cancel routes now cause texts because their shared cores do; nothing to do app-side.

## When complete

Update `docs/HANDOFF.md`, set the current task, commit.
