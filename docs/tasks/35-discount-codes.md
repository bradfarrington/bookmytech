# Task 35 — Discount codes the admin can send out

**Status:** ✅ Complete (2026-09-08) — on branch `task-35-discount-codes` (stacked on 30–34). **Migration `0063` must be applied before this code is deployed** (three new tables, two `bookings` columns, one SECURITY DEFINER function). `tsc` clean, 318 unit tests (8 new), lint clean on every touched file, production build compiles. **Not exercised in a browser or against Stripe** — the tables don't exist until `0063` is applied; the manual script is under "How to verify". Deviations from the plan: none.

## Why this exists

The last of Gareth's twelve items (2026-09-08):

> "On the main dashboard can we add a tab in for discounts that I can send out and apply to
> customer bookings to honour their repeat custom, like 10% off your next booking etc."

Nothing like it existed. The only discount-shaped thing in the platform was the referral
credit ledger (`customer_credits`), whose `'promo'` source had never been written by anything.

## Owner decisions (Brad, 2026-09-08)

- **Book My Tech absorbs the discount**, exactly as it absorbs referral credit: the customer
  pays less, the **mechanic's payout is unchanged**, and it comes out of the platform's own
  commission. A 10% code on a £120 job costs BMT £12 of its £18 fee.

## What shipped

### Schema — `0063_promo_codes.sql`

- **`promo_codes`** — `code` (unique, uppercase, `^[A-Z0-9-]{3,24}$`), `kind`
  (`percent` | `fixed`), `value`, `description`, `starts_at`, `expires_at`,
  `max_redemptions` (null = unlimited), `per_customer_limit` (default 1),
  `min_total_pence`, `is_active`, `created_by`.
- **`promo_redemptions`** — one row per use: `reserved` while the customer is at the card step
  (keyed on the PaymentIntent, one-hour TTL), `redeemed` once the booking exists, `released`
  when the hold was abandoned. Reserved-but-unexpired rows count toward the caps, so two
  people can't take the last redemption at once. Unique on (code, booking) and on the intent.
- **`promo_code_sends`** — who a code was sent to, on which channel, and whether it failed.
- **`bookings.discount_pence` + `promo_code`**.
- **`redeem_promo_code(...)`** — SECURITY DEFINER, revoked from anon/authenticated. Locks the
  code row (`for update`), counts live redemptions, enforces both caps, then inserts. **The
  single enforcement point**: doing it in application code would be a read-then-write race,
  and the thing being raced for is money.
- RLS: admin-only on all three. A customer never reads the table — they type a code and get a
  sentence back, so an invalid code can't be told apart from someone else's code.

### Rules — `lib/promos/validate.ts` (pure, tested)

`validatePromoCode(code, ctx)` → `{ discountPence }` or a customer-facing sentence: "That code
isn't valid." / "…has expired." / "…isn't active yet." / "…has been used up." / "You've already
used that code." / "…needs a booking of at least £X." / "Sign in to use a discount code."
Percent → `round(total × value/100)`; fixed → `min(value, total)`, never more than the total.

`chargeAfterDiscounts(total, discount, credit)` — **discount first, then credit on what's
left**, charge floored at 0. Deliberate: credit is the customer's own money and shouldn't be
spent on an amount they were never going to pay.

### Checkout — one place, both clients

`lib/promos/apply.ts`: `resolvePromoCode` (look up + count + validate), `reservePromo`,
`claimPromoForBooking`, `attachPromoRedemption`, `releasePromoForIntent`.

- **`prepareCheckoutFor`** takes `promoCode`: resolves it, applies discount then credit,
  creates the hold for what's left, and **reserves** the redemption against that intent. If the
  reservation is refused, the hold it just opened is cancelled rather than left to expire.
  The result gains `discountPence` and `promoCode` (additive on both success arms).
- **`createBooking`** re-resolves and **claims before writing anything** — a code that ran out
  in the meantime returns `{ ok: false, code: "promo_unavailable" }` with no row written and
  the hold untouched. Usually the claim is just finding the standing reservation; it takes a
  fresh one for a `free` booking (no intent) or after a lapsed reservation, and only that path
  can answer no. The claim is tied to the booking immediately after the insert.
- **`completeAndCharge`** captures `total − credit − discount`; **`refundBooking`** measures
  what was charged the same way; **`releaseStrandedHold`** gives the reservation back.

### Customer — `/book/slot`

"Have a discount code?" under the account block; applying re-runs `prepareCheckout` with the
code, so **the server is the only thing that ever decides what a code is worth**. Accepted →
"Code WELCOME10 applied". The price summary at the card step gains a `Discount (CODE)` row
above the credit row. The code rides in the sessionStorage draft, so a 3-D Secure detour keeps
it. `promo_unavailable` after the card was confirmed reports the orphaned hold to ops, clears
the code and puts the customer back on the picker with an explanation.

### Admin — `/admin/discounts` (Commercial → Discounts)

List with offer, window, used/cap, sent count and a live switch; create/edit form (type,
value, dates, total and per-customer caps, minimum basket); detail page with **Send to
customers** (search the `customer_admin_summary` view, multi-select chips, optional SMS when
credits allow, up to 200) plus the redemption and send histories. Actions in
`app/actions/discounts.ts`. Sends go one at a time through the ordinary transactional senders
— there is no bulk pipeline, deliberately — and every attempt is logged, so a failure is
visible rather than silent.

On a customer's page, a **Give them something** card: **Grant credit** (£ + reason → the
ledger's `promo` source, which nothing wrote until now — it applies itself at their next
checkout with no code to type) and **Send a discount code** (pick a live code, one click).

### Notifications

Email `promo_code_offer` (the code in a dashed panel via a new `promo_code_panel` renderer,
what it's worth, when it runs out, a Book button) and SMS `promo_code_offer`. Both appear in
the admin editors and honour the notification toggles like every other template.

## How to verify

1. Apply `0063`. `/admin/discounts` → New code → `WELCOME10`, 10%, total uses 2, per customer
   1 → saved and live.
2. As a signed-in customer, book anything: at the slot step, "Have a discount code?" → type
   `WELCOME10` → Apply → "Code WELCOME10 applied". Continue: the summary shows
   **Discount (WELCOME10) −£X** above any credit, and the hold is `total − discount − credit`.
3. Abandon it (release the hold from the app, or leave it an hour) → the redemption row goes
   `released`, and the code is available again.
4. Book it properly → `bookings.discount_pence` and `promo_code` set; the redemption is
   `redeemed` against the booking; the confirmation email says "Amount pre-authorised (after
   £X discount): …".
5. Same customer, same code again → "You've already used that code." A second customer →
   works. A third → "That code has been used up."
6. Complete the job → Stripe captures `total − discount − credit`; the receipt shows the
   discount line; **the mechanic's payout is the full pre-discount share**. Admin refund is
   capped at what was actually charged.
7. `/admin/discounts/<id>` → Send to customers: pick three → three emails, three
   `promo_code_sends` rows, the list shows them. Tick "Text it as well" with SMS on → texts too.
8. A customer's page → Credit tab → Grant £5 "goodwill" → ledger row (source Promo) → their
   next checkout applies it with no code.
9. Refusals: an unknown code, an expired one, one below its minimum, and a guest (signed out)
   each get their own sentence.
10. Mobile: `POST /checkout/prepare` with `promoCode` → `discountPence` + `promoCode` in the
    reply, or `{ ok: false, error }` with the sentence; `POST /bookings` with the same code →
    the booking above.

## Acceptance criteria

- [x] Admin can create, edit and switch off percentage and fixed-amount codes with windows and caps
- [x] A customer can apply a code at checkout and sees the saving before paying
- [x] The discount comes off before account credit; the charge is `total − discount − credit`
- [x] BMT funds it: the mechanic's payout is unchanged
- [x] Caps are race-safe (one locked SQL function; reservations count while a customer pays)
- [x] An abandoned hold gives the redemption back
- [x] Admin can send a code to chosen customers by email (and text), with a log
- [x] Admin can grant credit directly to one customer
- [x] Mobile: `promoCode` accepted on prepare and bookings, additive
- [x] Unit tests for validation and the discount/credit arithmetic
- [ ] Exercised end-to-end in a browser and against Stripe test mode — script above

## Follow-ups / open questions for Gareth

- **BMT funds the discount** (Brad's decision). If a code should instead come off the
  mechanic's share, that is a one-line change in `chargeAfterDiscounts`'s callers plus a
  payout recompute — worth asking before running a big campaign.
- **A cancelled booking does not hand its code back.** The redemption stays used; the admin
  can send another. Say if it should be automatic.
- Codes are **signed-in only** (they key on `customer_id` for the per-customer cap), like
  credit. A guest sees "Sign in to use a discount code."
- No scheduled sends, segments or unsubscribe — this is a hand-picked send to a handful of
  customers, not a marketing tool. A real campaign feature would need an opt-out.

## Mobile app (per AGENTS.md)

1. **Migration `0063`** → `npm run db:types`. `bookings` gains `discount_pence` (integer, not
   null, default 0) and `promo_code` (text, nullable) — both readable by the app; show the
   discount line on a booking when `discount_pence > 0`. The three new tables are admin-only.
2. **`POST /api/mobile/v1/checkout/prepare`** accepts optional **`promoCode`**. Both success
   arms gain **`discountPence`** and **`promoCode`** (additive). An invalid code comes back as
   `{ ok: false, error }` with a sentence to show verbatim — treat it as "clear the field and
   let them try again", not a failed request.
3. **`POST /api/mobile/v1/bookings`** accepts the same `promoCode`. New failure arm
   `{ ok: false, code: "promo_unavailable", error }`: **nothing was written and the hold is
   untouched** — release the hold and re-prepare without the code (the same recovery shape as
   `slot_passed`).
4. The amount held is `total − discount − credit`; `total_pence` on the row is still the
   pre-discount figure, so render the discount as its own line rather than adjusting the total.

## When complete

Update `docs/HANDOFF.md`, set the current task, commit.
