# Task 53: Saved cards

**Status:** 🚧 Backend built (2026-09-15): migration `0076_saved_cards_and_account_limits.sql`, `lib/payments/saved-cards.ts`, the payment-methods endpoints, checkout using saved cards, and account deletion removing them. The website's Payment methods page and saved cards at web checkout ship with Task 48.

## Why

The redesigned app has Payment methods (`mockups/05-account-settings.html`). Until now no card was kept anywhere: the CRM only created manual-capture PaymentIntents, never a Stripe Customer.

## Owner decision (Brad, 2026-09-15)

Checkout makes the payment against the stored Stripe Customer **only if they have a saved card**. Everyone else's hold is made exactly as before.

## Design

**Where the Customer id lives:** a service-role table, `stripe_customers` (profile, livemode, customer id), deliberately not `profiles.stripe_customer_id` as the app suggested.
- The "Users can update own profile" policy isn't column-restricted. A customer could point their profile at someone else's Customer, then list or pay with that person's cards.
- No client needs the id.
- Keying by `livemode` means switching test and live keys never mixes them up.

**Adding a card**
- The server makes a SetupIntent on the customer's Stripe Customer, creating the Customer on the first card (idempotency key per profile).
- The client confirms it: the website's PaymentElement, or the app's PaymentSheet in setup mode.
- Stripe attaches the card itself.
- Limit: 10 cards.

**Default card**
- It's the Customer's `invoice_settings.default_payment_method`.
- When there's none, or it was removed, the newest card becomes the default the next time the cards are listed.

**Remove and make default:** both check that the card belongs to the caller's own Customer first.

**Checkout** (`prepareCheckoutFor`)
- When the customer has a saved card, the hold is made with `customer` set.
- A CustomerSession is returned so the card form lists the saved cards: the `payment_element` component on web, `mobile_payment_element` in the app. Save and remove are disabled inside the payment form.
- Additive fields on the `preauth` result: `customerId` and `customerSessionClientSecret`, both null otherwise.
- A card typed at checkout isn't saved.

**Account deletion:** deletes the Stripe Customer, which removes the cards, then the `stripe_customers` row. A failure is logged with the id and never blocks the deletion.

**Rate limits:** all endpoints use the new `account` family (`0076` seeds it, with code defaults in `lib/rate-limit/limiter.ts`).

## Acceptance criteria

- [ ] `0076` applied (owner)
- [x] `GET /api/mobile/v1/account/payment-methods` lists the caller's cards, newest first, with one default
- [x] `POST /api/mobile/v1/account/payment-methods` returns a SetupIntent secret, the customer id and a CustomerSession secret
- [x] `POST …/:id/remove` and `…/:id/default` only act on the caller's own cards, and return the updated list
- [x] Checkout makes the hold against the Customer only when there's a saved card, and returns the session to list them
- [x] Account deletion deletes the Stripe Customer
- [ ] Website Payment methods page: list, add, remove, default (Task 48)
- [ ] Web checkout lists saved cards (Task 48)
- [ ] Tested end to end with Stripe test cards (owner, after `0076`)

## Mobile app

**Payment methods screen** (`src/lib/payment-methods.ts`)
- **List:** `GET /api/mobile/v1/account/payment-methods` returns `{ cards }` in the existing `SavedCard` shape.
- **Add:** `POST` the same path (no body), then `initPaymentSheet({ setupIntentClientSecret, customerId, customerSessionClientSecret, merchantDisplayName })` and `presentPaymentSheet()`, then list again.
- **Remove and set default:** `POST …/payment-methods/:id/remove` and `…/:id/default` return `{ ok, cards }`.

**Checkout:** when `/checkout/prepare` returns non-null `customerId` and `customerSessionClientSecret`, pass both to `initPaymentSheet` with the payment intent's client secret. The sheet then lists the saved cards.

**Deletion:** no change; account deletion handles the cards.

## When complete

Tick the boxes above, set the Status line, update `docs/HANDOFF.md`, commit.
