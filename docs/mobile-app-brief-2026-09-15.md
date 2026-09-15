# Mobile app brief: the dashboard data of 2026-09-15 (Tasks 49 to 54)

Hand this whole file to a Claude session working in `bmt-customer-app`. It's written to be pasted as a prompt. It says what the backend now serves for the redesigned screens, what the app must do, and what it must not assume.

---

You're working in `bmt-customer-app`, the React Native / Expo customer app for Book My Tech. Its backend is the separate Next.js repo, `bookmytech`. Your README's **"Data to build next"** lists the gaps between the redesigned screens and the data that existed. The backend has now built that list, apart from help-centre chat and phone, which don't exist.

Read the app's own `AGENTS.md` / `CLAUDE.md` first and follow its conventions.

**Status before you start**
- **Everything is additive.** A build shipped before this keeps working.
- **Migrations `0072` to `0077` are written but not applied yet.** Build against the contracts below, and test once Brad says they're in.
- **Tolerate the missing tables.** Until then, the new tables and views don't exist and the new endpoints answer with an empty or "not available yet" result. Keep the screens' empty states for that case.

## Step 0: regenerate types

Once the migrations are applied, run `npm run db:types`. If you haven't regenerated since Task 43, this also picks up `0069` to `0071`.

| Table or view | What's new | Who can read or write |
|---|---|---|
| `customer_addresses` | New (§1) | Customer: read, insert, update, delete own |
| `customer_vehicles` | New (§2) | Customer: read own, update `nickname` only, delete own. Adding goes through the API |
| `mechanic_cards` | `specialisms`, `approved_at` appended (§3) | As before |
| `mechanic_public_reviews` | New view (§3) | Customers who've booked that mechanic |
| `reviews` | `is_public`, `visibility_changed_at`, `visibility_changed_by` | As before (own reviews) |
| `customer_inbox_reads` | New (§4), plus RPCs `mark_inbox_item_read`, `mark_inbox_all_read` | Customer: own row |
| `stripe_customers` | New, **service-role only** (§5) | Nobody in the app. It only appears in the types |
| `account_deletions` | Three count columns | Service-role only |

---

## 1. Saved addresses (`src/lib/addresses.ts`)

Read and write the table directly under RLS.

- **List:** `from('customer_addresses').select('id, label, kind, note, address_line_1, address_line_2, postcode, parking_type, special_instructions, is_default').order('is_default', { ascending: false }).order('created_at')`
- **Add:** insert `{ customer_id: <signed-in user id>, label, kind, note, address_line_1, address_line_2, postcode, parking_type, special_instructions, is_default? }`
- **Edit and delete:** update or delete by `id`.
- **"Set as default":** `update({ is_default: true }).eq('id', id)`.

**The table enforces its own rules**, so don't duplicate them:
- **Default:** the first address becomes the default automatically. Setting one as default clears the old one, and deleting the default promotes another.
- **Tidying:** text is trimmed and the postcode is stored as "NG12 7GG" whatever spacing was typed.
- **Limits:**

  | Field | Rule |
  |---|---|
  | `label` | 1 to 40 characters |
  | `kind` | `home` / `work` / `other` |
  | `note` | up to 80 characters |
  | address lines | up to 120 characters each |
  | `postcode` | a full UK postcode |
  | `parking_type` | `driveway` / `street` / `car_park` / `other`, or null |
  | `special_instructions` | up to 500 characters |

  Breaking a limit is a check-constraint error (code `23514`); validate in the form first.
- **Cap:** the 21st address fails with code `P0001` and the message "You can save up to 20 addresses. Remove one to add another." Show that message as it is.

**Booking flow:** offer saved addresses on the Address step. Picking one fills the form, and the customer can still edit.

## 2. The garage (`src/lib/garage.ts`)

Vehicles are now stored, not derived from bookings. A customer's past bookings were copied in by the migration, and every new signed-in booking adds its vehicle.

- **List:** `GET /api/mobile/v1/garage` (Bearer token, customer accounts). Response:
  ```jsonc
  { "available": true, "vehicles": [ {
      "id": "uuid", "registration": "S28BSW", "displayRegistration": "S28 BSW",
      "nickname": "The school run car" | null,
      "make": "FORD" | null, "model": "Focus" | null, "colour": "BLUE" | null,
      "fuelType": "PETROL" | null, "yearOfManufacture": 2018 | null,
      "motStatus": "Valid" | null, "motExpiryDate": "2026-10-01" | null,
      "taxStatus": "Taxed" | null, "taxDueDate": "2027-01-01" | null,
      "detailsCheckedAt": "ISO" | null, "createdAt": "ISO"
  } ] }
  ```
  - **DVLA refresh:** the server keeps the DVLA details fresh (weekly, or daily once MOT or tax is within 30 days), so **drop the app's own 24-hour DVLA cache** (`garageDetails`).
  - **Formats:** dates are `YYYY-MM-DD`, and makes come from DVLA in capitals.
  - **Before the migration:** `available` is `false`.
- **Add:** `POST /api/mobile/v1/garage` with `{ registration, nickname? }`. Response: `{ ok: true, vehicle, alreadySaved } | { ok: false, error }`.
  - The registration is checked with DVLA first.
  - Adding one that's already there returns it with `alreadySaved: true`.
  - Show `error` as it is.
  - Up to 20 vehicles.
- **Rename (direct):** `from('customer_vehicles').update({ nickname }).eq('id', id)`. Nickname up to 30 characters; empty means none. Only `nickname` is writable, and any other column is refused.
- **Remove (direct):** `from('customer_vehicles').delete().eq('id', id)`. Their bookings are untouched.
- **History:** unchanged. The vehicle's bookings, from the bookings you already read (`lastJobFor`).
- **Rate limit:** the endpoints count against a new `account` family, and a 429 carries a sentence to show.

## 3. Mechanic profile (`src/lib/mechanics.ts`)

- **`fetchMechanicExtras`:** `from('mechanic_cards').select('specialisms, approved_at').eq('id', id).maybeSingle()`. `joinedAt` is `approved_at`.
- **`fetchMechanicReviews`:** `from('mechanic_public_reviews').select('id, rating, tags, comment, mechanic_response, created_at, reviewer_first_name').eq('mechanic_id', id).order('created_at', { ascending: false }).limit(20)`
  - The view only includes reviews with a comment that an admin hasn't hidden, from customers who haven't deleted their account.
  - `reviewer_first_name` is null for a guest-era review: show "A customer".
  - `mechanic_response` is the mechanic's reply, if any. You may show it.
  - Like `mechanic_cards`, it only answers for mechanics the customer has booked.
- **Review form consent line:** add under the form: "Your first name, rating and comment may be shown on your mechanic's profile." The website has the same line.

## 4. Inbox read state (`src/lib/inbox.ts`)

Keep building the feed exactly as today. Only read state moves to the server, so it follows the customer across phones and the website. The model is unchanged: `before`, `ids` capped at 200, and 7 days counting as read.

- **Load:** `from('customer_inbox_reads').select('read_before, read_ids').maybeSingle()`. No row means nothing read yet (`before: null, ids: []`).
- **Open an item:** `rpc('mark_inbox_item_read', { p_item_id: item.id })`, with the existing `event:<uuid>` / `reminder:<uuid>` ids. It moves the id to the front and caps the list, so two devices never overwrite each other.
- **"Mark all read":** `rpc('mark_inbox_all_read')`.
- **Missing table:** before the migration the select fails with a missing-table error. Fall back to your AsyncStorage state, or treat it as empty.
- **Unread count:** apply the same rules for an unread count on the Inbox tab if you show one. The website's header shows a dot.

## 5. Saved cards (`src/lib/payment-methods.ts`) and checkout

### Where the Stripe Customer lives

Your README suggested `profiles.stripe_customer_id`. The backend used a service-role table, `stripe_customers`, instead. The profiles update policy isn't column-restricted, so a customer could have pointed their profile at someone else's Stripe Customer and used their cards. You never need the id itself: the endpoints return cards.

### Endpoints

All take a Bearer token, customer accounts only, and count against the `account` rate-limit family.

**List:** `GET /api/mobile/v1/account/payment-methods`

```jsonc
{ "cards": [ { "id": "pm_…", "brand": "visa", "last4": "4242", "expMonth": 12, "expYear": 2030, "holderName": "Hannah R" | null, "isDefault": true } ] }
```

- This is your existing `SavedCard` shape.
- Newest first. When there are cards, exactly one is the default.
- `503 { error }` when Stripe can't be reached.

**Add:** `POST /api/mobile/v1/account/payment-methods`, no body.

```jsonc
{ "ok": true, "setupIntentClientSecret": "seti_…_secret_…", "customerId": "cus_…", "customerSessionClientSecret": "cuss_…" | null }
| { "ok": false, "error": "…" }
```

Then:

```ts
await initPaymentSheet({
  merchantDisplayName: 'Book My Tech',
  setupIntentClientSecret,
  customerId,
  customerSessionClientSecret, // omit when null
});
const { error } = await presentPaymentSheet();
```

- Stripe attaches the card to the customer when the sheet succeeds, so there is no confirm call.
- Fetch the list again afterwards.
- Up to 10 cards.

**Remove:** `POST /api/mobile/v1/account/payment-methods/:id/remove`, no body. Response: `{ ok: true, cards } | { ok: false, error }`.

**Make default:** `POST /api/mobile/v1/account/payment-methods/:id/default`, no body. Response: `{ ok: true, cards } | { ok: false, error }`.

Both return the list afterwards, so the screen can redraw without another call. Removing the default makes the newest remaining card the default. An id that isn't one of the caller's cards returns "We couldn't find that card."

### Checkout

`POST /api/mobile/v1/checkout/prepare`: the `preauth` success arm gains `customerId` and `customerSessionClientSecret`. **Both are null unless the customer has a saved card** (Brad's decision). When they're set, the hold is made against that Stripe Customer; pass them to the sheet and it lists the saved cards:

```ts
await initPaymentSheet({
  merchantDisplayName: 'Book My Tech',
  paymentIntentClientSecret: clientSecret,
  ...(customerId && customerSessionClientSecret ? { customerId, customerSessionClientSecret } : {}),
});
```

- **Saving at checkout:** a card typed at checkout is **not** saved, and save or remove is switched off inside the checkout sheet. Saving happens on Payment methods.
- **Unchanged:** the hold itself, the confirm flow and `POST /bookings`.

### Account deletion

No app change. Deleting an account now also deletes the Stripe Customer and its cards.

## 6. Mechanics per arrival window (`src/lib/slot-availability.ts`)

`GET /api/mobile/v1/slots?day=YYYY-MM-DD&postcode=NG12%207GG`. Open to guests; the postcode is optional.

```jsonc
{ "day": "2026-09-23", "areaChecked": true, "windows": [
  { "window": "8am–10am", "startHour": 8, "mechanics": 4, "bookable": true },
  …,
  { "window": "All day (8am–8pm)", "startHour": null, "mechanics": 6, "bookable": true }
] }
```

**The windows**
- `window` uses the same labels as `bookings.slot_window` and your `BookingSlotOption.window`.
- Days up to 30 ahead.
- `400 { error }` for a bad day, `429`, `503`.

**What `mechanics` counts**
- Approved, unsuspended mechanics whose saved hours cover the window and who have no other timed job in it.
- With a postcode, only mechanics who cover it. That's the same radius rule dispatch uses.
- **Without a postcode**, the count covers every mechanic and `areaChecked` is `false`. Consider not showing a count then, as it would overstate local availability.

**How to show it**
- Hide the count when `bookable` is false or `mechanics` is 0.
- **It's a count, not a reservation.** Never block a window on it.
- The website hides it at 0.

## 7. Cancellation policy (`src/lib/cancellation-policy.ts`)

`GET /api/mobile/v1/cancellation-policy`. Public.

```jsonc
{ "tiers": [
  { "key": "before_24h", "label": "More than 24 hours before", "feePence": 0 },
  { "key": "within_24h", "label": "Within 24 hours", "feePence": 3000 },
  { "key": "en_route",   "label": "Once your mechanic is on the way", "feePence": 5000 }
] }
```

- **Order:** always this order, which is cheapest first.
- **Display:** show a fee of 0 as "Free".
- **The mockup's third row is wrong.** It reads "Under 2 hrs / mechanic en route", but there's no 2-hour tier in the backend. Use `label`.
- **Source:** the figures are the ones the cancel actually charges. The per-booking fee still comes from `/bookings/:id/cancel-quote`.

## 8. Reschedule keeps the arrival window

The redesigned Reschedule screen picks a day and a 2-hour window. Until now a customer reschedule stored only the exact start time and cleared `slot_window`, so a booking moved to "2pm–4pm" showed as "2:00pm".

`POST /api/mobile/v1/bookings/:id/reschedule` accepts an **optional** `slotWindow` alongside the existing body:

```jsonc
{ "scheduledAt": "2026-09-18T13:00:00.000Z", "reason": "…", "slotWindow": "2pm–4pm" }
```

- **When the window is kept:** `slotWindow` is one of the six 2-hour labels (the en-dash labels `/slots` returns) and `scheduledAt` is that window's start in UK time. The booking then keeps `slot_window` as that label, the emails and texts say "Thu 18 Sep · 2pm–4pm", and the `reschedule_accepted` event payload gains `slot_window`.
- **Anything else is ignored, never an error**, and the move works exactly as before (exact time, `slot_window` null). An old build that doesn't send it is unaffected.
- **All day can't be chosen on a reschedule**, on the website or here.
- **Response shape and `candidate_days`:** the response shape is unchanged, and `candidate_days` is still cleared.

**Mechanic counts per window:** use `/slots` (§6) with the booking's postcode.

## 9. Help centre

No change. There's still no chat, phone number or opening hours in the backend, so keep Chat and Phone hidden. Email (`support@bookmytech.co.uk`) is the contact.

---

## What to do, in order

1. Regenerate types once Brad confirms `0072` to `0077` are applied.
2. **Addresses:** the Addresses screen (direct table access), and saved addresses on the booking flow's Address step.
3. **Garage:** list and add through `/garage`; rename and remove directly; drop the device DVLA cache.
4. **Mechanic profile:** extras and public reviews, plus the consent line on the review form.
5. **Inbox:** read state through `customer_inbox_reads` and the two RPCs.
6. **Payment methods:** list, add (PaymentSheet setup mode), remove, default. Then checkout: pass `customerId` and `customerSessionClientSecret` when present.
7. **Time step:** counts from `/slots`.
8. **Cancel screen:** the policy table from `/cancellation-policy`.
9. **Reschedule:** send `slotWindow` (§8).
10. Tick off each `TODO(data)` stub in `src/lib/` and update the README's "Data to build next".

If a response shape here disagrees with what the API actually returns, trust the API and tell Brad. These are contracts, and a mismatch is the backend's bug to fix, not something to work around in the app.
