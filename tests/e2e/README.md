# End-to-end tests (Playwright)

Automates the flows in [`docs/manual-test-guide.md`](../../docs/manual-test-guide.md).
This is a **scaffold + one proven flow** (§1.1, the core booking). The remaining
sections are mapped below as TODOs — copy the §1.1 spec as your template.

## Running

```bash
npm run test:e2e          # headless, all specs
npm run test:e2e:ui       # Playwright UI mode (great for writing new specs)
npm run test:e2e:headed   # watch the browser drive the flow
npx playwright show-report
```

Playwright auto-starts `npm run dev` (reusing one if already running) and reads
`.env.local`. The first run needs the browser binaries: `npx playwright install chromium`.

## How it works

- **`playwright.config.ts`** — boots the dev server, loads `.env.local`, and sets
  `TEST_OUTBOX_DIR` so no real emails/SMS are sent (see below). Two projects:
  `setup` (seed + auth) runs first; `chromium` runs the specs.
- **`setup/seed.setup.ts`** — idempotently creates three accounts
  (`e2e.customer@…`, `e2e.mechanic@…`, `e2e.admin@…`) via the Supabase service
  role and sets their roles. ⚠️ Writes to whatever project `.env.local` points
  at — use a dev/staging project, not production.
- **`setup/auth.setup.ts`** — logs each role in and saves its session to
  `.auth/<role>.json`. Reuse in a spec without re-logging in:

  ```ts
  import { storageStateFor } from "./helpers/users";
  test.use({ storageState: storageStateFor("customer") });
  ```

- **External services** (the "Stripe test mode + assert senders" strategy):
  - **Stripe** runs in real **test mode** — the spec fills a test card in the
    Stripe iframe and asserts the resulting PaymentIntent via the Stripe API
    (`helpers/stripe.ts`) instead of eyeballing the dashboard.
  - **Email/SMS** are **captured, not sent**. `lib/test-outbox.ts` (active only
    when `TEST_OUTBOX_DIR` is set) appends each message to `.outbox/outbox.jsonl`;
    `helpers/outbox.ts` reads it. So "check your email" becomes
    `waitForOutbox(e => e.to === customerEmail)`.

## ⚠️ The Stripe card-entry limitation (important)

Stripe's in-browser `confirmPayment` is gated by bot-detection (hCaptcha) that
**never resolves under Playwright** — the card iframe fills fine, but the submit
hangs forever. This is a known, unavoidable wall, not a flaky selector. So §1.1
is split across the two payment paths the app actually has:

1. **Guest card pre-auth** (`§1.1 guest checkout …`) — drives the funnel, captures
   the manual-capture `PaymentIntent` that `prepareCheckout` returns, then
   **confirms it via the Stripe API** (`helpers/stripe.ts → confirmHold`) to place
   and assert the real uncaptured full-price hold.
2. **Credit-covered "free" booking** (`§1.1 a fully-credited booking …`) — a
   signed-in customer with seeded credit books with **no Stripe step**, so the
   booking is actually created in-browser. This is what verifies the confirmation
   screen, the booking row, and the confirmation email via the outbox.

When you write the §3 money flow (capture + transfer), do the capture assertion
against the Stripe API / a test webhook, never by driving the card iframe.
`helpers/stripe-card.ts` (fills the PaymentElement) is kept only for probing in
`--headed` mode; don't rely on it in CI.

## Coverage map (guide § → spec)

| Guide section | Spec file | Status |
|---|---|---|
| §1.1 Make a booking (core flow) | `customer-booking.spec.ts` | ✅ Done (template) — 2 flows, see the Stripe note below |
| §1.2 Customer dashboard | `customer-dashboard.spec.ts` | ⬜ TODO — `storageState: customer`, assert booking listed |
| §1.3 Cancel a booking | `customer-cancel.spec.ts` | ⬜ TODO — assert hold released via Stripe API |
| §1.4 Reschedule | `customer-reschedule.spec.ts` | ⬜ TODO |
| §2 Mechanic onboarding + approval | `mechanic-onboarding.spec.ts` | ⬜ TODO — 5-step wizard, 15 MB upload, admin approve |
| §3 Mechanic job → completion (money flow) | `mechanic-job.spec.ts` | ⬜ TODO — needs online mechanic + dispatch; assert capture + transfer |
| §4 Reviews & referrals | `reviews-referrals.spec.ts` | ⬜ TODO |
| §5 Disputes | `disputes.spec.ts` | ⬜ TODO |
| §6 Admin (oversight, pricing, mechanics, SMS) | `admin.spec.ts` | ⬜ TODO — `storageState: admin` |
| §7 Regression re-tests | folded into the above | ⬜ TODO |

## Not automated here (need extra setup)

- **3DS card** (`4000 0025 0000 3155`) — needs the Stripe auth-popup handshake.
- **DVLA/MOT reg lookup** (§1.1 first step) — live external API; §1.1 bypasses it
  via query params. A separate, network-tolerant test can cover the lookup UI.
- **Real inbox content** — we assert the send, not rendered HTML in a real inbox.
  Add Mailosaur/Ethereal later if you want to read actual delivered mail.
