# Customer app: show estimated part prices (backend Task 72)

The backend (`bookmytech`, Task 72) now prices a repair's parts even when our parts supplier doesn't list a part for the customer's car, which is common on new models. The missing part is **estimated** from other cars of the same make and model (any year), so the customer gets one full price instead of "£X + parts". The app needs to say when a part price is an estimate.

## What changed in the API (all additive, nothing renamed or removed)

1. **`POST /api/mobile/v1/quote`** and **`POST /api/mobile/v1/checkout/prepare`**: every item in `parts[]` now has **`estimated: boolean`**.
   - When `estimated` is true, `brand` is `null`.
   - Treat a missing `estimated` as `false`, since an older backend won't send it.
2. **`GET /api/mobile/v1/repairs/tree?parts=1`**: a bookable node can now carry **`partsEstimated: true`** alongside `partsPence` / `totalPence`. It's absent otherwise; treat absent as false.

Nothing else changed. Repairs that can't be priced still have no `partsPence` / `totalPence`, and the "£X + parts" fallback still applies to them.

## What to build

1. **Repair rows (browse):** where a row shows its total with parts included, and `partsEstimated` is true, replace the "parts included" wording with **"includes estimated parts"**.
2. **Price / quote screen, parts list:** for a line with `estimated: true`, append **" · estimated"** after the part name. There's no brand to show.
3. **Under the parts list,** when any line is estimated, show this note instead of the usual one:
   > Parts for your exact vehicle, included in the price above. Parts marked estimated are our best price for your vehicle; if one costs more, your mechanic will ask you before going ahead.
4. **Checkout / confirm screen:** wherever parts lines are listed, the same **" · estimated"** suffix.

## Copy rules (owner's instruction)

- Never mention AAG, Alliance Automotive, "supplier", or that a price couldn't be found. Use only "estimated" and "our best price for your vehicle".
- Use the wording above exactly, to match the website.

## Also

- After Brad applies migration `0087`, run `npm run db:types`. It only adds `booking_parts.price_estimated`, which the customer app doesn't read, but keep the types current.
- Don't change any request shapes. Nothing new is required from the app.
