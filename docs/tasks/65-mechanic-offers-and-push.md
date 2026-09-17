# Task 65: The mechanic app — offers, arrival windows and push

**Status:** ✅ **Complete (2026-09-17).** Built and verified; migrations `0081` and `0082` applied by Brad the same day. A real push on a phone is still to be seen (needs the app build). Everything in the prompt shipped. Additions beyond it: a `GET …/offers` summary route (the answer to its "can the app read the booking before accepting?" question), a per-job `GET …/arrival-windows` rather than a static list, a second rate-limit family for polled reads, and a privacy fix to two RLS policies.

Source: `bmt-mechanic-app/docs/offers-crm-prompt.md`. Builds on Task 64 (`requireMobileMechanic`).

## The two questions the prompt asked

**Can a mechanic read an offer's booking before accepting?** Yes — too much of it. `"Mechanics can view offered bookings"` (0008) exposes the **whole row**: RLS is row-level, so that read includes the customer's name, phone, email and street address. The app should not use it. It gets `GET /api/mobile/v1/mechanic/offers` instead: vehicle, repair(s), postcode **district**, distance from base, when, payout, special instructions — and nothing that identifies the customer. Full details arrive after accepting, through the assigned-booking policy.

**Do offers expire?** No. There is deliberately no `expires_at` (0008's header: broadcast, first-to-accept, "NO expires_at column"). An offer ends when somebody accepts, or the mechanic declines. The only timer is the admin's 5-minute stall alert. The app can show "offered 2 min ago" from `offeredAt`; it has nothing to count down to.

**Related, for the app:** this repo polls and does not use Supabase Realtime (owner decision, 2026-06-04). `job_offers` is still listed in the `supabase_realtime` publication from 0008, but nothing subscribes and it should stay that way — poll `GET …/offers`. The `mechanicfeed` limits are sized for a ~10-second poll.

## Routes — all under `app/api/mobile/v1/mechanic/`

| Route | Body | 200 | Shared core |
|---|---|---|---|
| `GET offers` (`?offerId=`) | – | `{ offers: OfferSummary[] }` | `liveOfferSummariesFor` |
| `POST offers/[id]/accept` | none | `{ bookingId, needsArrivalWindow }` | `acceptOfferFor` |
| `POST offers/[id]/decline` | none | `{}` | `declineOfferFor` |
| `GET bookings/[id]/arrival-windows` | – | `{ needsArrivalWindow, days[] }` | `loadArrivalWindowOptionsForDays` |
| `POST bookings/[id]/arrival-window` | `{ window, dayKey? }` | `{}` | `setArrivalWindowFor` |
| `POST devices` | `{ token, platform }` | `{ ok: true }` | – |
| `POST devices/remove` | `{ token }` | `{ ok: true }` | – |

Refusals: **409** someone else got it / already answered / window can't be set now; **403** not yours; **404** gone; **400** not a valid window or day. The refusal sentence is the core's own and is written for the mechanic. `OfferSummary` is documented in `lib/mechanics/offer-summaries.ts`; the window options in `lib/mechanics/arrival-windows.ts` (`ArrivalWindowOption`).

`dayKey` is **required** for a flexible booking (which offered day) and optional otherwise. `needsArrivalWindow` is true for every all-day booking, which includes every flexible one.

`arrival-windows` is per job, not a static list: it is the same function the website's picker and the POST's re-check use, so the app inherits clashes, already-started windows and off-hours advice without duplicating the rules.

### Delegate, never reimplement

- `lib/mechanics/offers.ts` ← `app/actions/job-offers.ts`
- `lib/mechanics/set-arrival-window.ts` ← `app/actions/mechanic-jobs.ts` (`setArrivalWindow` only)

The cores take the mechanic id and return a refusal `code`; the server actions drop it and behave as before, the routes map it to a status (`lib/mobile/mechanic-actions.ts`).

## Push to mechanics

- `mechanic_push_tokens` (0082), a mirror of `customer_push_tokens`. A separate table and separate routes so one phone with both apps cannot cross the streams; `sendPushToCustomer` is unchanged in behaviour.
- `sendPushToMechanic` beside it, both on one private send path (`buildPushMessage`, `triageTickets`, receipt parking). A dead token from a receipt is deleted from both tables, since a receipt doesn't say which app it was for.
- `dispatchBooking` pushes each mechanic it creates a **new** offer for. `ignoreDuplicates` + `select` returns only inserted rows, so `redispatchPending` — which re-runs for every waiting booking whenever any mechanic comes online — doesn't re-notify mechanics who already hold the offer.
- Payload: title `New job offer`, body `<repair> · <district> · <when>`, `data: { type: "offer", offerId }`, Android channel **`offers`** (`ANDROID_OFFERS_CHANNEL`). The lock screen never shows the customer's name, street or phone.

## Migration `0082`

1. `mechanic_push_tokens` — RLS on, no policies, service-role only.
2. Seeds `mobile_mechanicfeed_*` (polled reads). `0081`'s `mobile_mechanic_*` were raised to 15/min, 300/day to cover the new actions — `0081` had not been applied, so it was edited in place.
3. **Privacy fix.** The two "offered" policies (`bookings`, `booking_repairs`) only checked that an offer row *exists*. Offers are never deleted, so a mechanic who declined, or lost the race, kept a permanent read of that customer's row. Both now require `response is null`. The website's offer page was reordered to check the offer before the booking so an answered offer still renders "no longer available" rather than a 404.

**Not closed:** a mechanic with a *live* offer can still read the full row directly. The app doesn't; the website's offer page does. Closing it means serving that page from the server and dropping the policy — its own task.

## Acceptance criteria

- [x] Two mechanics' tokens race `accept` on the same booking: one 200, one 409. *(Verified live 2026-09-17 with a temporary second mechanic; booking assigned once, sibling offer superseded, one `mechanic_assigned` event. All test data removed.)*
- [x] A customer's token gets 403 on every route. *(All seven.)*
- [x] Creating an offer sends a push to a registered mechanic. *(Verified to the point of the send: the push was captured by the test outbox with the right payload and channel, and was not repeated on re-dispatch. **Not** verified on a real device — that needs `0082` and a build of the app.)*
- [x] The web offer page behaves as before. *(Same code, now in `lib/`; typecheck, lint on touched files and 598 unit tests pass. Not clicked through in a browser.)*
- [x] Customer email, SMS and push still go out on accept and on arrival-window set. *(All six captured.)*
- [x] **`0082` applied** — Brad, 2026-09-17. `/mechanic/devices` and mechanic push work from the next deploy.
- [ ] A real push received on a phone — needs the app build, its Expo push credentials, and `0082`.

## For the app repos

- **`bmt-mechanic-app`:** see the message sent back with this task — read offers from `GET …/offers`, poll rather than subscribe, create the `offers` Android channel, register with `/mechanic/devices`, and treat 409 as "taken". Regenerate types after `0082`.
- **`bmt-customer-app`:** regenerate types after `0082`. No route, table or push behaviour of its own changed.
- **Expo (Brad):** if `EXPO_ACCESS_TOKEN` is set on Vercel, it must belong to an account that can push to **both** Expo projects, or mechanic sends will be rejected. The mechanic app also needs its own APNs key / FCM credentials in EAS — check `push_receipts` and the Expo dashboard first if nothing arrives.
