# Customer app: show a service's "before you book" sheet (backend Task 74)

The backend (`bookmytech`, Task 74) added DPF cleaning services for diesel cars. A DPF clean is charged whether or not the filter clears, so the customer must read how it works **before they book**. The website shows this under the price. The app needs to do the same.

## What changed in the API (all additive, nothing renamed or removed)

1. **`POST /api/mobile/v1/quote`**: every item in `products[]` now has **`infoSheet`**, either `null` or an array of blocks:
   - `{ "type": "heading", "text": "How we do it" }`
   - `{ "type": "paragraph", "text": "…" }`
   - `{ "type": "bullets", "items": ["…", "…"] }`

   Treat a missing `infoSheet` as `null`, since an older backend won't send it.
2. **Products now depend on the car's fuel.** `GET /repairs/tree` only lists what the car's fuel is offered: DPF services for diesels only, and a petrol and a diesel "Major service" with different wording. If the app sends a product id that doesn't fit the car (for example a cached petrol "Major service" id for a diesel), `/quote` answers with its same-named twin for that fuel, which has a **different `products[].id`**. Carry the ids the quote returns into checkout, as the website does. Sending the original id also works, because the server swaps it the same way every time.
3. Repair search (`GET /repairs/search`) finds much more (plurals, "dpf", "water pump", "cambelt", "change my brake pads"…) and returns `truncated: false` far more often. The shape is unchanged.

## What to build

1. **Price / quote screen:** for each product in `products[]` with a non-null `infoSheet`, show a card under the price and above the "Pick a time" button:
   - small caps label **"Please read before you book"**
   - the product's `name` as the title
   - the blocks in order: headings bold, paragraphs as body text, bullets as a bulleted list.
2. Show it for every such product when there are several in the basket, one card each.

## Also

- After Brad applies migration `0088`, run `npm run db:types`. It adds `catalogue_products.fuel_types` and `catalogue_products.info_sheet`. The app doesn't read that table, but keep the types current.
- Don't change any request shapes. Nothing new is required from the app.
