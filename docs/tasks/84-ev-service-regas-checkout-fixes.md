# Task 84: EV service, air-con regas, discount code on the payment page, multi-job checkout fix

**Status:** ✅ Complete (2026-11-23), not yet pushed. The multi-job booking fix, the two new services (created switched off at £0) and the discount code on the payment step shipped. No migration. Deviation: air-con regas is a fixed price, not refrigerant by weight (see 2). Not tried in a browser: typecheck, lint and unit tests only.

Brad, 2026-11-23: "Can we create a ev service … add into it a pollen filter as all evs had them done - Also air conditioning regas needs to be added as well - I've just spotted on checkout there's nowhere to put the discount code … [multi-job booking] wont let me finalise". Then: "do 2 - but this needs to pull parts from napa and the amount from haynespro - 3. yes add it to the payment page aswell as before payment so it is a double".

## 1. Multi-job bookings that mix a job with a service failed to save

**Cause.** supabase-js sends a bulk insert with the union of the rows' keys and fills a key a row lacks with NULL, **not the column default**. `booking_repairs` rows named `kind` only on product lines, so the job lines of a mixed basket went in as `kind = NULL` and broke its not-null constraint. The customer saw "We couldn't save the jobs on this booking" with the card hold already live (orphaned-hold email, `pi_3Uer25FbyUl7LioE0NPi3KIE`, £487.25, Gareth's test). Reproduced against the live table.

**Fix.** `bookingRepairRows` (`lib/bookings/repair-lines.ts`) gives every row the same keys; booking creation and applied revisions both use it. Revisions had the same bug and would have silently dropped a booking's lines (none of the 5 live multi-job bookings had lost theirs). `catalogueBookingPartRows` had the same pattern with `price_estimated`. It couldn't fire while estimates are off, but would have broken bookings when they came back on, so it now names the column on every row.

## 2. EV service and air-con regas

Created, both **switched off at £0** for Brad to set the price and switch on:
- **EV service**: servicing, fuel = electric, pollen filter priced from NAPA per car (Task 83), no engine oil, no checklist yet (Brad is writing the schedule).
- **Air con regas**: servicing, every fuel, **a fixed price** like the pre-purchase inspections. No parts.

Refrigerant by weight (HaynesPro's grams × a £/100 g setting per gas) was built, then taken out the same day. Brad: "the air con regas wont be pulling prices it will be a fixed price like we have done for the pre purchase inspections". HaynesPro's own regas ("Drain/refill the air-conditioning system", `1V00050000WV0`) is hidden for every car, and so is the old-layout "Air conditioning" group (`1V00000000G`, 2026-11-18). **Correction, checked live the same day:** cars on HaynesPro's newer layout (Leaf ZE1, Puma Gen-E, S-Max FHEV) keep air-con jobs under "Heating, ventilation and air conditioning (HVAC)" (`1V1`), and some of those still show. Seen: "Renew the air-conditioning compressor", "Renew the air-conditioning condenser", compressor bracket and clutch. They need refrigerant, so most go to "Get a quote". Whether to hide them is Brad's call. If it's ever wanted: HaynesPro's capacities carry "Refrigerant = 460 ± 15 (g)" rows, headed "With R134a / R1234yf refrigerant" (fixtures `capacities-301000817.json`, `-619114949.json`), and NAPA lists nothing for part type 1442. The removed code is in commit `8259a46`.

## 3. Discount code on the payment page

The payment step (where "To pay" is) now has "Have a discount code?" too, as well as the step before. Applying it re-prepares the checkout with the code (a fresh intent for the new amount; `Elements` is keyed on the client secret so it remounts). It's hidden once the card is authorised, because the hold is for the amount shown. Enter in the box applies the code rather than submitting the card.

## Acceptance

- [x] A basket with a HaynesPro job and a service saves its lines (row shape checked against the live table)
- [x] Revisions write lines the same way
- [x] EV service and Air con regas created (switched off, £0)
- [x] Discount code on the payment step, before the card is authorised
- [x] Both switched on at £0 so Gareth can see them live (Brad, 2026-11-23). Interim and Full service set to petrol + diesel at the same moment. Checked on the live site: the Leaf and Puma see EV service (£17.28 / £24.12, the pollen filter only) and Air con regas (£0). The S-Max hybrid still sees Interim, Full and Major.
- [ ] Brad sets real prices on EV service and Air con regas (both bookable at £0 / pollen-filter-only until then)
- [x] "EVs not recognised" (BD26HXH, FN72RMO, EA23XLW, checked 2026-11-23): all three match HaynesPro on the live site (Puma Gen-E, Leaf ZE1, S-Max 2.5 FHEV) with full repair data. The real fault: a pure EV's Servicing offered only Interim and Full service (no fuel set), and both went to "Get a quote" because NAPA has no oil filter for an electric car, so an EV had no bookable service. Fixed by switching on the EV service and setting Interim + Full to petrol + diesel, both at the same moment (the two boxes above). EA23XLW is a petrol hybrid and prices all three services normally. It had never been matched before, so an earlier failure was probably a passing HaynesPro error (failures are remembered for a few minutes).
