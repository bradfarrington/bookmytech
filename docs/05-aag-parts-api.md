# Supplier APIs — AAG Sales API v2 (parts pricing, stock and ordering)

**Written 2026-09-10.** Gareth has a trade account with **Alliance Automotive Group (AAG)** — the group behind Apec, NAPA, FPS and a large network of "LV Subs" motor factors — and AAG have issued API credentials for their **Sales API v2**. This doc is the single reference for what that API offers, what has been verified, how it would slot into the existing booking and parts flows, and what is still open. It is the parts counterpart to `docs/04-supplier-apis.md` (HaynesPro). Credentials are **NOT in this file** — they live in `.env.local` (gitignored) under the env names below, and in Gareth's email thread.

The integration manual is checked in at `docs/suppliers/aag-sales-api-v2-customer-integration-v1.07.pdf`.

---

## 1. The account

| Account | What it is | Env vars (in `.env.local`) | Status |
|---|---|---|---|
| **AAG Sales API v2** | POST-JSON API: quote fitting parts for a registration by TecDoc GenArt product group (with trade price + branch stock), look up known part numbers, re-check a basket, and place on-demand / advance / stock orders against a named AAG branch. | `AAG_API_KEY`, `AAG_CUSTOMER_ID` (the account number), `AAG_VERIFICATION_ID` (only if issued), `AAG_BASE_URL`, `AAG_AUTH_HEADER`, `AAG_AUTH_SCHEME` | UAT credentials issued 2026-09-10, corrected 2026-09-14. **UAT sandbox verified 2026-09-14** (quotes succeed, see §3). Production credentials follow AAG's demo call. |

Two hosts. **UAT sandbox** `https://aag-sapi-uat1.aaguklabs.co.uk/` is the default everywhere; **live** `https://sales.allianceautomotiveapis.co.uk/` has to be opted into per environment with `AAG_BASE_URL`.

### ⚠️ The IP-allowlist question (open)

AAG's security team asked for "the website's IP address" so it isn't blocked. They mean the **outbound address of the server that calls their API** — the browser never talks to AAG; `lib/aag/client.ts` does, from a Vercel function. Vercel functions on our plan have **no fixed outbound IP**: each call leaves from a shared, changing pool of AWS addresses. So there is no honest single address to give them, and "allowlist the AWS region" is far too broad for a security team to accept.

What has been asked of AAG (2026-09-10, via Gareth): can they allowlist by **API key + account** instead of IP? If they insist on an IP, the fix is a **static-IP forward proxy** in front of the AAG calls only (a small VPS with a fixed IPv4 running a forward proxy, or a hosted static-IP proxy service) — one `dispatcher` option on the fetch in `lib/aag/client.ts`, planned as a follow-up, not part of Task 40. Vercel Secure Compute would also give dedicated egress IPs but is Enterprise-only.

**Confirmed 2026-09-10 (first probe run, from Brad's machine):** the sandbox host sits behind **Cloudflare with an IP allowlist**. Every request to `aag-sapi-uat1.aaguklabs.co.uk` — the quote POST under all three header variants, and even a bare `GET /` — gets **HTTP 403 with Cloudflare's "Attention Required — you have been blocked" HTML page**, so nothing reaches AAG's API at all. That is what their security team's request is about: they need the caller's IP on the sandbox allowlist. The **live** host (`sales.allianceautomotiveapis.co.uk`) has no such edge block from the same address — requests reach AAG's application and get a proper JSON envelope back (§3).

**Resolved for UAT 2026-09-14:** AAG confirmed they have allowlisted the development IP (`80.6.218.98`, Brad's connection). The same day, requests from it reach AAG's application on UAT instead of the Cloudflare block page. If the dev connection's IP changes, the sandbox will 403 again; re-check with `curl -s https://api.ipify.org` and send AAG the new one.

**Blocked again 2026-09-15:** the dev connection now appears as **`80.1.6.55`** (AAG's own `/cdn-cgi/trace` confirms it). Every UAT request gets the Cloudflare block page again, even a bare `GET /` with no credentials. Live still answers normally (`ISE0034` without credentials). **Send AAG `80.1.6.55`.**

**Since 2026-09-15 AAG is the only parts supplier** (LKQ removed, Task 43), and its prices feed customer quotes.

So there are two IP conversations, not one:

- **Sandbox / development:** ✅ done (above).
- **Production:** ✅ **answered 2026-09-14: no IP allowlist on live.** AAG confirmed production authenticates on the **API credentials alone**, so the Vercel functions can call it directly. **No static-IP proxy or VPS is needed.** The IP allowlist applies to the UAT sandbox only.

---

## 2. What the API offers vs. what BMT needs

### Authentication — three headers

- An **API key** in the header **`api_key`**, bare (no prefix). The manual never names it; AAG's example curl (Chris, 2026-09-14) does, and UAT confirms it (§3). The client defaults to it; `AAG_AUTH_HEADER` / `AAG_AUTH_SCHEME` remain as overrides only.
- `customer_id` — the account number. Required on every call.
- `verification_id` — "some accounts" need it; one-to-one with `customer_id`. Error `ISE0101` means it was wrong or missing.

### The HTTP status is inverted

The manual documents **201 = success, 200 = error**. `parseAagEnvelope` in `lib/aag/client.ts` therefore reads `Header.SuccessFlag` / `Header.ErrorCode` / `Header.Message` from the body and ignores the status; only a non-2xx (the gateway, a firewall, the allowlist) is treated as "unreachable". Do not "fix" this by checking `res.ok`.

### Methods

| Method | What | BMT relevance |
|---|---|---|
| `POST /api/quote` | `{CustomerProductGroup: "82", VRM, IncludeVehicleDetails}` → articles (catalogue parts that fit) → product options (buyable products: id, brand, Premium/Standard/Budget rating, `CostPrice`, `Surcharge`, `RecMinOrdQty`, lock-out flag) → availability per AAG location (id, name, type Local/Buddy/RDC/NDC, qty, ETA string, priority). Optionally the DVLA-style vehicle details AAG resolved. | **The core.** One call per product group per vehicle. Wrapped as `aagQuote`. |
| `POST /api/quote/classic` | Several product groups at once; flatter shape; returns a `QuoteId`. Manual warns multi-group requests are slow and that its header fields are "not yet available". | Alternative to the above; wrapped as `aagQuoteClassic` so both can be compared on the sandbox. |
| `POST /api/product/info` | Known AAG part numbers → description, price, rating, product groups; `ProductsNotFound` for the rest. | Re-pricing a saved part; wrapped as `aagProductInfo`. |
| `POST /api/product/enquiry` | Re-validate a basket (needs each line's `RequestLineId` from a quote) → current price + availability, and the `AagLocationId` an order needs. | Full build only. **Not wrapped.** |
| `POST /api/order/on-demand` | Place a same-day order per line against a named `AagLocationId`, echoing `RequestLineId` and `ExpectedDeliveryTime`. AAG stock-checks before confirming. | Full build only. **Not wrapped** — nothing in Task 40 may order. |
| `POST /api/order/advance` / `/api/order/stock` | Non-urgent orders with a date; no stock check. | Full build only. **Not wrapped.** |
| `POST /api/servicetimeandparts` | A whole service (Full = 1, Interim = 2) as repair tasks with times and parts. | **No longer supported** — "will be replaced with a more advanced and faster alternative". This was the one method shaped like our service model, so we must map repairs → GenArts ourselves (§4). |

### Money and quantities

`CostPrice` and `Surcharge` are **pounds with a decimal** (11.21). `lib/aag/quote.ts` converts to integer pence at the edge (`poundsToPence`); nothing downstream sees a float. `RecMinOrdQty` is the unit of issue — order quantities round **up** to it (brake pads come as 2 = one axle set). `Surcharge` is a core charge and "currently not available to all accounts".

### Availability and delivery

Each product option lists one or more AAG locations with `Priority` (1 = quickest). The manual: use priority 1 by default; if the order needs more than that location's free stock, move to priority 2 and so on; **avoid splitting one part across locations**. `EstDeliveryTime` is a display string ("13:00", "N/A", "14:15 NWD") computed from request time — not a timestamp, and not something to store past the day.

### What AAG is NOT

- Not a labour-time source (HaynesPro remains that).
- Not a vehicle-identification source for us — it resolves the registration itself and can return what it found (`VehicleDetails`), but our identification stays DVLA + HaynesPro. Worth comparing on the sandbox: if AAG's VIN/engine data is reliable it could become a second identification signal.
- Not a catalogue browse — there is no "list product groups" call. The GenArt ids we send have to come from us (§4).

---

## 3. Verified live calls (sandbox)

**First run 2026-09-10 — no quote yet, but three things are now verified rather than assumed:**

| Host | Request | Result | What it tells us |
|---|---|---|---|
| UAT | `POST /api/quote` (x-api-key), (`Authorization: ApiKey`), (`Authorization: Bearer`); `GET /` | **HTTP 403**, Cloudflare "you have been blocked" HTML — identical for all four | The sandbox is IP-allowlisted at the edge. Nothing reaches AAG. Header name untested. |
| Live | `POST /api/quote` with `x-api-key`; with `Authorization: ApiKey`; with `Authorization: Bearer`; and without `verification_id` | **HTTP 200** + `{"Header":{"SuccessFlag":false,"ErrorCode":"ISE0034","Message":"User is unauthorized, check api key and customer key"}}` — identical for all four | Live is reachable from an arbitrary IP and answers a real AAG envelope. **The manual's inverted status is real: an error comes back as HTTP 200.** `parseAagEnvelope` handled it. The credentials are refused on live under every header we tried, so they are most likely **sandbox-only** — the header question is still open. |

**Second run 2026-09-14 — after AAG allowlisted `80.6.218.98` on UAT and sent an example curl.** All read-only quotes for `DV12CGU`, GenArt 82:

| Host | Request | Result | What it tells us |
|---|---|---|---|
| UAT | `POST /api/quote`, our key under `api_key`, our `customer_id` + `verification_id` | **HTTP 200** + `ISE0101` "Invalid Verification ID supplied" | **The allowlist works** (no Cloudflare page). **`api_key` is the right header**: the key got past `ISE0034`. |
| UAT | Same, with a bogus key under `api_key` | HTTP 200 + `ISE0034` | Control: the key really is checked, so reaching `ISE0101` means ours is accepted. |
| UAT | Same, our key under `x-api-key` | HTTP 200 + `ISE0034` | Confirms `x-api-key` (the old default) was wrong. |
| UAT | `api_key` with: no `verification_id`; `verification_id: 76335` (from AAG's example); `customer_id: NAPATEST` + `76335` (AAG's example pair); a bogus `customer_id` | HTTP 200 + `ISE0101`, all four | **The verification ID is checked before the account number** (a bogus customer still says `ISE0101`), and neither our issued ID nor the example one passes. So we can't yet tell whether `customer_id` is right. |
| UAT | `POST /api/quote/classic` with `api_key`, our IDs (and with an empty `verification_id`) | **HTTP 401**, RFC 7807 problem JSON `{"title":"Invalid Credentials","ISECode":"ISE0034"}` | The classic endpoint refuses differently: a real 401 and no `Header` envelope. `aagCall` reads any non-2xx as "gateway refused", so this shows as unreachable, not auth-failed. Revisit once credentials pass. |
| Live | `POST /api/quote`, our key under `api_key` | HTTP 200 + `ISE0034` | The key is still refused on live, consistent with AAG saying these are **UAT credentials**. |

~~Blocked on AAG: the verification ID.~~ Resolved the same day: AAG sent corrected UAT credentials (a different account number and verification ID, now in `.env.local`).

**Third run 2026-09-14 — sandbox access proven.** Corrected credentials, `api_key` header, `DV12CGU` (AAG resolved it as a 2012 Vauxhall Meriva 1.4 petrol, VIN returned):

| Request | Result | Fixture |
|---|---|---|
| `POST /api/quote` GenArt 82 (brake discs) | **HTTP 201**, `Header.SuccessFlag: true`. 2 articles (front vented, rear solid) × 3 options each (NAPA, Brembo, NAPA Proformer), £14.50–£43.54 | `lib/aag/__fixtures__/quote-82.json` |
| `POST /api/quote` GenArt 402 (brake pads) | HTTP 201, success. Front + rear × Apec / Brembo / Brakefit, £13.70–£30.41 | `quote-402.json` |
| `POST /api/quote/classic` GenArt 82 | HTTP 201, success. **13 products**, flat | `quote-classic-82.json` |
| `POST /api/product/info` `NPANBD5400`, `BRE08.7627.11` | HTTP 201, success, both found; prices match the quote | `product-info.json` |

`npm test` runs the fixture-gated tests in `lib/aag/aag.test.ts` against these, all green. The earlier `/api/quote/classic` 401 was the bad verification ID, not a separate permission.

**Recorded facts (vs. the manual):**
- **Success is HTTP 201**, as documented; errors are HTTP 200.
- The **auth header** is `api_key`, bare. **`verification_id` is required** for this account.
- **`/api/quote/classic` answers in camelCase** (`header.successFlag`, `body.products[].costPrice`), not the manual's PascalCase, and has **no `QuoteId`**. `parseAagEnvelope` now reads either casing for the envelope. `AagQuoteClassicBody` in `lib/aag/types.ts` is still PascalCase: nothing in the app calls `aagQuoteClassic`, so fix the types before anything does. `/api/quote` and `/api/product/info` are PascalCase as documented.
- **Ratings are `Good` / `Better` / `Best`**, not the manual's Budget / Standard / Premium. The classic quote lowercases them (`best`).
- **`LocationType` is upper case** (`LOCAL`).
- `CustomerLockoutRating` is `UNKNOWN` on every option; `Surcharge` is `0`.
- **ETA:** `/api/quote` gives `EstDeliveryTime: "Please call branch"`, while the classic quote gives a real time for the same branch (`deliveryNotes: "12:28"`). Both are from Milton Keynes (location 311, the only branch on UAT). Ask AAG whether live `/api/quote` returns real ETAs.

The remaining steps:

1. Put `AAG_API_KEY`, `AAG_CUSTOMER_ID` (+ `AAG_VERIFICATION_ID` if issued) in `.env.local`.
2. `node scripts/probe-aag-quote.mjs --vrm <a real reg> --genart 82`. Expected: `HTTP 201 · SuccessFlag true` and at least one article.
   - HTTP 403 with an HTML page → the IP allowlist (the dev IP has changed); go back to AAG.
   - `ISE0034` in the body → the key or account number is wrong.
   - `ISE0101` → the verification ID is wrong or missing.
3. `--save` the reply (`lib/aag/__fixtures__/quote-82.json`), then `--genart 402 --save` and `--classic --save`; `node scripts/probe-aag-product-info.mjs --ids <two ProductIds from the quote> --save`. `npm test` then runs the fixture-gated tests in `lib/aag/aag.test.ts` against real shapes.
4. `node scripts/probe-genart-coverage.mjs --vrm <the same reg> --quote` for §4.
5. Paste the probe output into this section, and replace "None yet".

Record here, when known: the working auth header; whether `verification_id` is required for our account; the actual HTTP status on success (the manual says 201); whether `Header` is present on the classic quote; whether `Surcharge` is populated; what `CustomerLockoutRating` values actually appear; and the `LocationType` casing.

---

## 4. How it slots into the existing flow

### The design problem: repair → product group

AAG prices by **TecDoc GenArt id**. Since `/api/servicetimeandparts` is dead, we have to say which GenArts a booked repair consumes. Two routes:

- **Free, from HaynesPro.** Repair-time nodes come back with `genarts: [{id, description}]` (`HpRepairtimeNode.genarts`, `lib/haynespro/types.ts`). Until Task 40 the catalogue composition discarded them; they are now carried through as the additive `CatalogueNode.genartIds` (`lib/haynespro/genarts.ts`, `lib/catalogue/overlay.ts`, `lib/haynespro/catalogue.ts`). If coverage is good, "Renew the front brake pads" → `[402]` → `aagQuote(reg, 402)` needs **no mapping table at all**.
- **Admin-maintained map.** The idea floated in `docs/04-supplier-apis.md` §6: a `genart_id` on `parts`, or a node-id → GenArt[] table. Needed for whatever HaynesPro leaves uncovered, and for products (servicing, inspections) which have no HaynesPro node.

`scripts/probe-genart-coverage.mjs` measures which it is: it walks a vehicle's repair tree and reports how many bookable repairs carry ≥1 GenArt, the distinct ids seen, and the repairs with none. Results go here:

**Coverage (not yet run — needs a reg in `haynespro_vehicle_cache` or a `--type`):**

| Vehicle | Repairs seen | With ≥1 GenArt | Distinct GenArts | Notes |
|---|---|---|---|---|
| — | — | — | — | — |

Expectation: labour-only jobs (adjust, check, bleed, diagnose) legitimately carry none; the question is whether the parts-consuming ones do.

### Where prices would land (full build, not Task 40)

- **Follow-on and on-site quotes** (Tasks 33/34/37) — `job_quote_lines.kind = 'part'` with `part_id`/`node_id`/`unit_pence` is the natural first home: the mechanic picks a repair, we quote its GenArts against the booking's `vehicle_reg`, and the mechanic chooses a product option. The `RequestLineId` and `AagLocationId` would need storing on the line for a later enquiry/order.
- **The mechanic's "Order via BMT" toggle** (`setPartSourcing`, `app/actions/booking-parts.ts`) — today a payout flag only; `booking_parts.status` already has `ordered` / `delivered`. An on-demand order call sits naturally there, after an enquiry re-check.
- **The booking funnel** — a "parts from £X" beside the labour price would come from `cheapestLine(flattenQuote(…))` per repair. Metered and slow (one AAG call per GenArt per vehicle), so it would need a short cache and must **never block the funnel** — same rule as HaynesPro.
- **`parts` / margin** — AAG's `CostPrice` is the supplier cost; the BMT price and margin stay ours (`lib/parts/margin.ts`). `parts.supplier_cost_pence` is admin-only under RLS and must stay so.

### Registration shape

`bookings.vehicle_reg` holds the spaced display form (`LB21 XYZ`). AAG's examples are unspaced; `aagRegKey` strips everything but `[A-Z0-9]` — the same shape as `cacheRegKey` in `lib/haynespro/vehicle.ts`.

### Health

`lib/aag/health.ts` records `ok` / `auth_failed` / `unreachable` in `platform_settings.aag_health` (with the host it happened on), and `/admin/parts/aag-check` shows it as a banner — same pattern and reason as `haynespro_health`.

---

## 5. Open questions

**For AAG (via Gareth):**
1. ~~Which header carries the API key?~~ **Answered 2026-09-14:** `api_key`, bare. Verified on UAT.
2. ~~Verification ID refused on UAT~~ **Resolved 2026-09-14:** AAG sent corrected UAT credentials, and quotes now succeed.
3. ~~UAT IP allowlist~~ **done 2026-09-14** (`80.6.218.98`). ~~Are the credentials UAT-only?~~ **Yes** (Chris, 2026-09-14); production credentials follow a demo call once development is done. ~~Does live apply an IP check?~~ **No** (2026-09-14): live works on credentials alone, so no static-IP proxy.
3a. ~~Does `/api/quote/classic` need separate enablement?~~ No; the 401 was the bad verification ID. **New:** on UAT `/api/quote` returns `EstDeliveryTime: "Please call branch"` while `/api/quote/classic` returns a real time for the same branch. Will live `/api/quote` return real ETAs?
4. The **list of GenArt product groups** the account can quote — is it the full TecDoc set, or an AAG subset?
5. **`/api/quote` or `/api/quote/classic`** — which do they recommend for new integrators, and what replaces `servicetimeandparts`?
6. Which **AAG locations / branches** serve our mechanics' areas, and how delivery to a mobile mechanic (no fixed workshop) is meant to work — deliver to the customer's address? Collect from branch?
7. Sandbox data: is stock/pricing on UAT representative, and which registrations return data there?

**For Gareth / Brad:**
8. Who pays for the parts and when — does BMT order on account (AAG invoices BMT) and re-charge the customer at the BMT price, as the Task 10 margin model assumes?
9. Should the customer ever see brand choices (Budget / Standard / Premium), or does the mechanic choose?
10. ~~Whether to pay for a static egress IP~~ — not needed; AAG live authenticates on credentials only (2026-09-14).

---

## 6. Proposed build order (→ becomes the full parts task when approved)

1. **Stage 0 — Task 40 (this spike):** sandbox access proven; `lib/aag/` read-only client; GenArt coverage measured; admin check page. Ends with §3 and §4 filled in.
2. **Stage 1 — mapping:** decide from the coverage numbers. Either rely on `CatalogueNode.genartIds` plus a small admin override table for the gaps, or a full node → GenArt map. Products (servicing) always need an explicit list.
3. **Stage 2 — quotes:** AAG-priced part lines on follow-on / on-site quotes, mechanic picks a product option; store `RequestLineId` + `AagLocationId` + supplier cost (admin-only) on the line.
4. **Stage 3 — ordering:** enquiry re-check then on-demand order from the "Order via BMT" toggle; `booking_parts.status` → `ordered` with `SupplierOrderNumber`; delivery ETA on the job page; a cron to chase undelivered.
5. **Stage 4 — funnel:** "parts from £X" per repair, cached per (reg, GenArt) for the day, fail-open.
6. **Ops:** live credentials + host switch after AAG's demo call (no static-IP proxy — live is credentials-only); `aag_health` on the ops monitor.

**Mobile app:** Task 40 adds one **optional** field (`genartIds`) to `CatalogueNode`, which the app receives from `GET /api/mobile/v1/repairs/{tree,search}` and ignores. No migration, no shape change, no endpoint. Stages 2–4 would each need app work and their own briefs.
