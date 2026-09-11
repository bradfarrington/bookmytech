# Task 43 — Supplier parts into quoting: engine oil, the mechanic's picker, and repair→parts

**Status:** 📋 Planned, not started (2026-09-11). Scoped and de-risked; **partly blocked on HaynesPro**. Read this before restarting — the split below is the point, and it is not obvious.

The manual `parts` catalogue is gone (Task 42). Everything is to come from the supplier APIs instead: the mechanic's on-site quote picker, the customer booking process, and the engine oil on a service.

---

## The standpoint we stopped at

Brad's question was "should we wait until HaynesPro is back before linking these up?" The answer is **partly** — and the useful finding is that **two of the four pieces don't need HaynesPro at all**.

### Blocked on HaynesPro — do not start

**1. Repair → parts linking.** `CatalogueNode.genartIds` (Task 40 Stage C) is the only thing that says *"this repair consumes these part types"*. LKQ can list every part that fits a car but not which ones a cambelt change needs. Nothing else supplies it.

**2. The customer booking funnel.** The repair itself comes from HaynesPro, so this path is already broken without it. Nothing to link to.

> **⚠️ HaynesPro is currently DEAD.** Confirmed twice on 2026-09-11: auth fails with `statusCode 1` ("unknown company"), and `docs/04-supplier-apis.md` §1 records the demo expiring **2026-08-09**. The entire repair catalogue and every booking quote run through it. **Check whether production is actually quoting before building anything on top.** Renewal is the critical path for this task and arguably for the product.

### NOT blocked — can be built today

**3. Engine oil matching.** *This is the one to start with.*

The current engine-oil line prices as `capacity × an admin-set £/litre`, with the capacity coming from HaynesPro (`lib/haynespro/oil-capacity.ts`, `ENGINE_OIL_PRICE_KEY`, default 1500 pence, `DEFAULT_ENGINE_OIL_LITRES` 5).

**LKQ supplies all of it directly, so HaynesPro is not needed for oil.** Verified live 2026-09-11 against `NV57XGP` (fixture: `lib/lkq/__fixtures__/ads-parts-000398-oil.json`), component **`000398` Engine Oil**:

- **35 products** returned for the vehicle;
- **all 35** state a fill quantity (`Other Information: "Fill quantity [l] 4"`);
- **14** name the exact engine code `B4164S3`;
- structured fitment columns: `Brand`, `Oil Viscosity Classification SAE`, `Pack`, `Description`, `Engine Code`, `Fitted Quantity`;
- viscosities offered 5W-30 and 0W-30; packs 1 / 4 / 5 / 20 litre.

Real prices for that car:

| Part | Brand | Pack | Price |
|---|---|---|---|
| 521771432 | CASTROL | 1 L | £13.87 |
| 521773420 | CASTROL | 5 L | **£33.38** |
| 521773421 | CASTROL | 4 L | £36.34 |
| 521771881 | MOBIL | 5 L | £43.56 |

**Why it matters commercially:** a 4-litre fill currently bills at `4 × £15 = £60`. The real 5-litre pack costs **£33.38** — and note the **5 L pack is cheaper than the 4 L pack**, so a naive "capacity × price per litre" gets it wrong in both directions. Pack selection is part of the problem, not an afterthought.

**4. The mechanic's on-site quote picker.** `listQuoteParts()` (`lib/quotes/mechanic.ts:300`) and `listQuotePartsAction` (`app/actions/job-quotes.ts:34`) read the now-unmanageable `parts` table and take no booking context. `bookings.vehicle_reg` is set at creation (`lib/bookings/create-booking.ts:321`), so the picker can be made vehicle-aware and fed from the supplier catalogue with no HaynesPro involvement.

---

## Recommended order when we restart

1. **Engine oil matching** — self-contained, wrong today in a way that costs money, and it proves the supplier→booking path end-to-end on one narrow case. When HaynesPro returns, the repair→parts link drops onto plumbing that is already working.
2. **Mechanic's on-site picker** — swap it to the supplier catalogue, scoped to the booking's vehicle.
3. **Repair → parts** — only once HaynesPro is back.
4. **Customer booking funnel** — last, and gated on production ADS credentials.

## Design decisions already taken

- **Fail open, always.** Oil is customer-facing, so it must fall back to the current flat £/litre whenever LKQ is unavailable, unconfigured, or the credit budget is spent. The booking funnel must never block on a supplier — the same rule the codebase already applies to HaynesPro (`lib/pricing/calculate.ts` header).
- **Cache per vehicle.** Oil products for a registration are as stable as the vehicle; reuse `adsLookupParts`, which already caches 7 days and spends at most one credit per vehicle+component.
- **Pick the pack, not the litre.** Choose the cheapest pack (or combination) that covers the fill quantity, and show what was chosen. Never bill `litres × unit price` off a pack price.
- **Commission is charged on the whole total, parts included** (Gareth, 2026-09-11). Already what the engine does; no change needed. See `docs/06-lkq-parts-api.md` §8 Q7.
- **No mark-up on parts** (Brad, 2026-09-11).

## Prerequisites to chase (neither is code)

1. **HaynesPro renewal.** Blocks items 3 and 4, and the repair catalogue generally.
2. **Production ADS credentials.** The PROD half of the credentials form is blank. 500 test credits are fine for an admin tool but will not survive customer booking volume — every new vehicle spends one or two. This gates item 4.

## Open questions carried in

- **Does LKQ's `ShowPrice` include the surcharge?** (`docs/06-lkq-parts-api.md` §8 Q1.) Still unverified, worth up to £59.95 on a starter motor. Cost and surcharge are currently carried and displayed separately so nothing depends on the answer.
- **Who keeps the difference when a mechanic fits a cheaper variant than the one quoted?** (§8 Q8.) Raised by combining "quote the dearest variant" with commission-on-parts: on a £67-vs-£32 disc pair the mechanic keeps roughly £70. Needs a deliberate answer before any quoting rule ships.

## Mobile app impact when this lands

**Item 1 alone changes displayed pricing** — the oil line on a service. Under the AGENTS.md rules that must be flagged to Brad and to the `bmt-customer-app` repo. `app/api/mobile/v1/quote/route.ts` already exposes `partsPence` and `oil` in its success payload, so the shape does not change, but the **figures will**. Items 3 and 4 touch booking creation and will need the same treatment.
