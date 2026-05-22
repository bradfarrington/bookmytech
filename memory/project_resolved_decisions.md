---
name: Resolved client decisions from slide deck Q&A
description: Business rules settled with the client covering cancellations, rescheduling, commission, payment model, onboarding, disputes, and surge removal
type: project
---

All of the following were confirmed by the client in a slide deck review session on 2026-05-22. These override anything in the original brief.

**Surge pricing:** Removed entirely from the platform. Do not implement or reference it.

**Commission:** Set per service in the admin console. No platform-wide flat rate. Falls back to a configurable default.

**Payment model:** Deposit pre-authorised at booking. Held until mechanic marks job complete. On completion, funds split between platform (commission) and mechanic (remainder). If mechanic cancels, the PaymentIntent is held and transferred to the replacement mechanic — the customer is NOT charged twice.

**Cancellation fees (customer-initiated):** >24 h before slot → £0. Within 24 h → £30. Mechanic already en route → £50. All three amounts are configurable in the admin console.

**Customer reschedule:** Stays with same mechanic. Reason required.

**Customer cancel:** Reason required. Fee applied based on timing.

**Mechanic reschedule:** New confirmation sent to customer (accept / decline / counter). If customer declines, job redistributed.

**Mechanic cancel:** Reason recorded and saved to mechanic's job history (visible in admin + mechanic dashboard). Job redistributed via standard offer flow. Original PaymentIntent held (not cancelled). Customer receives auto email: original mechanic cancelled, finding replacement. Second email when replacement accepts.

**Mechanic onboarding documents:** Two insurances required — public liability insurance AND trade insurance. DBS checks removed entirely. Mechanics described as "vetted professionals" in all customer-facing copy.

**Admin override on approvals:** Admin can approve mechanic with outstanding documents, granting a 28-day grace period. If grace period expires without documents, mechanic auto-suspended from distribution.

**Disputes:** Raised by customer from job list dashboard. Notifies both admin and assigned mechanic. Admin sees all correspondence but acts only as mediator — only intervenes if parties can't resolve it. BMT is the mediator.

**Mechanic suspension:** Admin can suspend mechanic accounts with reason + timeframe. Suspended mechanics immediately removed from job distribution. Suspension history retained on mechanic profile.

**Area pricing:** Each area has set prices per service. Labour charges vary by area. Parts pricing varies by area (dummy data in dev, API in production).

**Why:** Settled by client in kickoff Q&A session based on their slide deck. Documented in docs/00-working-brief.md section 11.

**How to apply:** These decisions are now baked into the task docs and working brief. Reference them when building any feature that touches payments, onboarding, disputes, or pricing.
