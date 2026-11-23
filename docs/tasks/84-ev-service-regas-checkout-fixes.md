# Task 84: EV service, air-con regas, discount code on the payment page, multi-job checkout fix

**Status:** ✅ Complete (2026-11-23), not yet pushed. The multi-job booking fix, refrigerant by weight, the two new services (created switched off at £0) and the discount code on the payment step all shipped. No migration. Deviations: refrigerant isn't from NAPA, which sells none (2026-11-17 parts-gap review: part type 1442 is "empty" on every car), so it's HaynesPro's grams × a £-per-100 g setting per gas, like engine oil. Not tried in a browser: typecheck, lint and unit tests only.

Brad, 2026-11-23: "Can we create a ev service … add into it a pollen filter as all evs had them done - Also air conditioning regas needs to be added as well - I've just spotted on checkout there's nowhere to put the discount code … [multi-job booking] wont let me finalise". Then: "do 2 - but this needs to pull parts from napa and the amount from haynespro - 3. yes add it to the payment page aswell as before payment so it is a double".

## 1. Multi-job bookings that mix a job with a service failed to save

**Cause.** supabase-js sends a bulk insert with the union of the rows' keys and fills a key a row lacks with NULL, **not the column default**. `booking_repairs` rows named `kind` only on product lines, so the job lines of a mixed basket went in as `kind = NULL` and broke its not-null constraint. The customer saw "We couldn't save the jobs on this booking" with the card hold already live (orphaned-hold email, `pi_3Uer25FbyUl7LioE0NPi3KIE`, £487.25, Gareth's test). Reproduced against the live table.

**Fix.** `bookingRepairRows` (`lib/bookings/repair-lines.ts`) gives every row the same keys; booking creation and applied revisions both use it. Revisions had the same bug and would have silently dropped a booking's lines (none of the 5 live multi-job bookings had lost theirs). `catalogueBookingPartRows` had the same pattern with `price_estimated`. It couldn't fire while estimates are off, but would have broken bookings when they came back on, so it now names the column on every row.

## 2. EV service and air-con regas

- **Refrigerant by weight** (`lib/haynespro/refrigerant.ts`): HaynesPro's capacities give the charge in grams, sometimes per gas ("With R134a / R1234yf refrigerant" headings) or per heat-pump variant. The gas is the one HaynesPro names. Where it names both or neither: a plate from 2017 on is R1234yf (a plate can't make a car look newer), from 2012 or before is R134a, and otherwise the dearer gas is charged. The figure is the largest for that gas.
- **Prices**: `/admin/pricing` → "Air-con refrigerant", R1234yf and R134a per 100 g (`platform_settings` keys `refrigerant_r1234yf_price_per_100g_pence`, `refrigerant_r134a_price_per_100g_pence`). Unset = a job needing gas goes to a quote.
- **Engine**: `quoteJobParts` prices part type 1442 (`REFRIGERANT_GENART`) this way and never asks NAPA for it or logs it as a NAPA gap. It's a `set_price` line named "Air-con refrigerant R1234yf · 460 g", so the mechanic knows what to put in, with no markup. This also prices HaynesPro air-con repairs that carry 1442 (evaporator, compressor lines), which went to a quote before.
- **Services**: "Air-con refrigerant" is tickable on a service (`SERVICE_PART_TYPES`). Created, both **switched off at £0** for Brad to set the labour price and switch on:
  - **EV service**: servicing, fuel = electric, pollen filter from NAPA, no engine oil, no checklist yet (Brad is writing the schedule).
  - **Air con regas**: servicing, every fuel, **a fixed price** like the pre-purchase inspections (Brad, 2026-11-23: "the air con regas wont be pulling prices it will be a fixed price"). Refrigerant isn't ticked on it. The by-weight pricing stays for HaynesPro air-con repairs, and does nothing until the gas prices are set.

## 3. Discount code on the payment page

The payment step (where "To pay" is) now has "Have a discount code?" too, as well as the step before. Applying it re-prepares the checkout with the code (a fresh intent for the new amount; `Elements` is keyed on the client secret so it remounts). It's hidden once the card is authorised, because the hold is for the amount shown. Enter in the box applies the code rather than submitting the card.

## Acceptance

- [x] A basket with a HaynesPro job and a service saves its lines (row shape checked against the live table)
- [x] Revisions write lines the same way
- [x] Refrigerant priced from HaynesPro grams × gas price, tested against all six real capacity fixtures
- [x] EV service and Air con regas created (switched off, £0)
- [x] Discount code on the payment step, before the card is authorised
- [ ] Brad sets the two services' prices and switches them on (the refrigerant prices are only needed if air-con repairs should price by weight)
- [ ] Interim and Full service set to petrol + diesel once the EV service is live (they currently show for EVs, with oil)
- [ ] EV registrations HaynesPro doesn't recognise: waiting on example regs from Brad
