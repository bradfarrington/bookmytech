# Task 43 — Supplier parts into quoting: engine oil, the mechanic's picker, and repair→parts

**Status:** 🅿️ Parked with owner decisions (2026-09-15). **Pick this up next, before Task 48.** HaynesPro is back (Task 44) and repairs now show their parts on the vehicle page (Task 45), but **customer prices still leave parts out**. See "Owner decisions (2026-09-15)" directly below; the rest of this doc is the 2026-09-11 scoping.

## The problem, as found (2026-09-15)

Brad booked an **air filter** for **S28 BSW** (Ford Ranger 3.0 TDCi, 2022 on). The booking price was **labour only**. The vehicle's model page shows the part as the default: MANN 502591409 from LKQ at £29.10. Two causes:

1. **Parts were never fed into customer prices.** `quoteRepairs` (`lib/haynespro/repair-booking.ts`) has one parts line, engine oil on servicing products. Task 45 built parts for the admin vehicle page only, and listed "feed the chosen parts into quotes" as the next step.
2. **Alliance Automotive didn't answer on that same lookup**: "We couldn't reach AAG at all (network error or timeout)". Its prices are still UAT sandbox data (Task 45 open questions), so check which endpoint production calls.

## Owner decisions (2026-09-15)

| # | Question | Decision |
|---|---|---|
| 1 | Mark-up and commission | **No mark-up.** The customer pays the supplier price. **Commission comes out of the total price**, parts included (the engine already does this). |
| 2 | A supplier doesn't answer | **It shouldn't time out.** Fetch both suppliers' parts and prices and pick the dearest, **fast**. |
| 3 | LKQ credits (14 of 350 this month) | Expected to become **unlimited in production**. Still cache per vehicle, for speed. |
| 4 | Which part matches count | **Only admin-confirmed part-group matches.** Any repair whose part groups are matched on that vehicle **must be priced with its parts when booking**. |
| 5 | A cheaper part gets fitted | **Not tracked.** We price the dearest part (or the admin's chosen one, per engine variant). Buying the parts is up to the mechanic. This closes §8 Q8 below. |

## What to build (proposed from the decisions; confirm while building)

- **Price the parts into the quote.**
  - For each HaynesPro job in `quoteRepairs`, take its part groups with a **confirmed** `part_group_links` row.
  - Look both suppliers up **in parallel** and pick each part with `selectRepairPart` (the admin's choice, else the dearest).
  - Add the parts to `breakdown.partsPence` alongside oil.
  - A job with no confirmed matches stays labour-only.
- **Speed and stability.**
  - The quote is recalculated at every step (Price, Time, Address, Confirm, the hold, booking create), so cache the part prices per registration and part group. The customer then sees one price the whole way through.
  - Give each supplier a short timeout.
  - **Assumption to confirm:** if one supplier fails, price from the one that answered, which is what `selectRepairPart` already does. If both fail, don't book without the part price.
  - **Investigate the AAG failure first.**
- **Show it.**
  - Parts appear on the price step and in Confirm's summary.
  - **The mechanic's job sheet names the exact part to buy** (supplier, brand, part number), because decision 5 leaves buying to them.
- **Probable SQL.** `bookings.parts_price_pence` already exists, and the app already reads it, so the parts total may need no new column. Storing the priced parts themselves (supplier, brand, part number, price per line) on the booking, so the job sheet and a later dispute can see them, needs a migration. Take the next free number when building; the dashboard plan reserved 0069 onwards for Tasks 49 to 55, so renumber those.
- **Prerequisites.**
  - Confirm `0067_repair_part_choices.sql` is applied. Without it, "Change" doesn't save.
  - Seed and confirm the part-group matches for common repairs.
- **Mobile app.**
  - The customer price shown in the app changes: `app/api/mobile/v1/quote` already returns `partsPence`, but the figure changes.
  - Any parts lines added to the quote or booking responses must be additive.
  - The app needs `npm run db:types` after the migration.
  - Tell Brad.

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
