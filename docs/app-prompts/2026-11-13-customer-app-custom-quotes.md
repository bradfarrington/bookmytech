# Customer app: ask for a quote, and book custom quotes (backend Task 75)

The backend (`bookmytech`, Task 75) adds **custom quotes**: when a customer can't find their job in the catalogue, they ask us for a quote. Brad prices it by hand as one total and the customer books it like any other job. The website already does all of this. The app needs to match.

## What changed in the API (all additive, nothing renamed or removed)

1. **`POST /api/mobile/v1/quote-requests`** (guest OR signed in; send the Bearer token when there is one)
   - Body: `{ reg, description, name, email?, phone?, postcode?, make?, model? }`. Signed in: the account's email is used and `email` is ignored. Guest: `email` is required.
   - `200 { ok: true, quoteId }` or `200 { ok: false, error }`. Show `error` verbatim.
   - `429` when sent too often. Show the `error`.
2. **`GET /api/mobile/v1/custom-quotes`** (signed in): `{ quotes: CustomQuoteView[] }`, newest first. Each:
   ```
   { id, status: "requested"|"sent"|"booked"|"declined"|"withdrawn", statusLabel,
     request, title, details, totalPence, visitHours,
     vehicle: { reg, make, model }, postcode,
     canBook, canDecline, bookingId, createdAt, sentAt }
   ```
   `title`, `details` and `totalPence` are `null` while `status` is `"requested"`.
3. **`GET /api/mobile/v1/custom-quotes/:id`** (signed in): `{ quote: CustomQuoteView }`, or `404`.
4. **`POST /api/mobile/v1/custom-quotes/:id/decline`** (signed in, no body): `{ ok: true }` or `{ ok: false, error }`.
5. **Booking a custom quote uses the existing endpoints.** Send its `id` as **`quoteId`** to `POST /checkout/prepare` and `POST /bookings`, exactly as for a follow-on quote. `vehicleReg`, `vehicleMake` and the repair ids may be omitted. The price, the car and the job name come from the quote, and the job is offered to every mechanic. Response shapes are unchanged.
6. **Push notification** when a quote is sent: title "Your quote is ready", body "£145 for <title>. Tap to view and book.", and `data: { customQuoteId, url }` with **no** `bookingId`. Today the app only deep-links on `bookingId`, so it just opens the app. Handle `data.customQuoteId` by opening the quote screen for that id (`GET /custom-quotes/:id`).
7. The quote email links to `https://bookmytech.co.uk/book/quote/<id>`. If the app handles universal links, open that path in the app's quote screen.

## What to build

1. **"Ask us for a quote"** on the repairs screen:
   - a row under the repair list: **"Can't find the job you need? Tell us about it and we'll email you a price."**
   - under search results: **"Not what you need? Ask us for a quote"**
   - in the no-results state: **"…or ask us for a quote"**

   Each opens a form with "What do you need doing?" (prefilled with the search text), registration (prefilled), postcode (optional), name, email (fixed when signed in) and mobile (optional), plus a **Send my request** button. On success show: **"Request sent. We'll price the job and email your quote to <email>, usually within one working day."**
2. **Quotes list** (in the account / bookings area): `GET /custom-quotes`. Show the title (or `request` while requested), `statusLabel`, the price when there is one, and the vehicle.
3. **Quote screen:** for `"sent"`, a price card with `formatPrice(totalPence)`, the title and the details, and the line "Parts and labour included". Then:
   - a **Book a time** button (when `canBook`) that enters the existing checkout from the time step with `quoteId`, skipping the price step;
   - a **Decline this quote** link (when `canDecline`) with a confirm step. For a `"requested"` quote the link says **Cancel my request**.
   - Under the button: **"Nothing is charged now. When you book, the amount is pre-authorised on your card and only taken once the job is done."**
4. In checkout with a custom quote, title the steps **"When suits you?"** and **"Confirm booking"**, not "return visit".

## Also

- After Brad applies migration `0089`, run `npm run db:types`. It adds `custom_quotes`, which a customer may read for their own rows under RLS, and `bookings.source_custom_quote_id`.
- The website now lists a customer's quotes at `/dashboard/quotes` and shows open ones on the dashboard home. Put the app's quotes list in the same places: an account-area row "Your quotes" and a home section while one is open.
