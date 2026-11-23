# Task 84: EV service, air-con regas, discount code on the payment page, multi-job checkout fix

**Status:** ✅ Complete (2026-11-23), pushed (`78102fb`). The multi-job booking fix, the two new services (created switched off at £0) and the discount code on the payment step shipped. No migration. Deviation: air-con regas is a fixed price, not refrigerant by weight (see 2). Not tried in a browser: typecheck, lint and unit tests only.

Brad, 2026-11-23: "Can we create a ev service … add into it a pollen filter as all evs had them done - Also air conditioning regas needs to be added as well - I've just spotted on checkout there's nowhere to put the discount code … [multi-job booking] wont let me finalise". Then: "do 2 - but this needs to pull parts from napa and the amount from haynespro - 3. yes add it to the payment page aswell as before payment so it is a double".

## 1. Multi-job bookings that mix a job with a service failed to save

**Cause.** supabase-js sends a bulk insert with the union of the rows' keys and fills a key a row lacks with NULL, **not the column default**. `booking_repairs` rows named `kind` only on product lines, so the job lines of a mixed basket went in as `kind = NULL` and broke its not-null constraint. The customer saw "We couldn't save the jobs on this booking" with the card hold already live (orphaned-hold email, `pi_3Uer25FbyUl7LioE0NPi3KIE`, £487.25, Gareth's test). Reproduced against the live table.

**Fix.** `bookingRepairRows` (`lib/bookings/repair-lines.ts`) gives every row the same keys; booking creation and applied revisions both use it. Revisions had the same bug and would have silently dropped a booking's lines (none of the 5 live multi-job bookings had lost theirs). `catalogueBookingPartRows` had the same pattern with `price_estimated`. It couldn't fire while estimates are off, but would have broken bookings when they came back on, so it now names the column on every row.

## 2. EV service and air-con regas

Created, both **switched off at £0** for Brad to set the price and switch on:
- **EV service**: servicing, fuel = electric, pollen filter priced from NAPA per car (Task 83), no engine oil, no checklist yet (Brad is writing the schedule).
- **Air con regas**: servicing, every fuel, **a fixed price** like the pre-purchase inspections. No parts.

Refrigerant by weight (HaynesPro's grams × a £/100 g setting per gas) was built, then taken out the same day. Brad: "the air con regas wont be pulling prices it will be a fixed price like we have done for the pre purchase inspections". HaynesPro's own regas ("Drain/refill the air-conditioning system", `1V00050000WV0`) is hidden for every car, and so is the old-layout "Air conditioning" group (`1V00000000G`, 2026-11-18). **Correction, checked live the same day:** cars on HaynesPro's newer layout (Leaf ZE1, Puma Gen-E, S-Max FHEV) keep air-con jobs under "Heating, ventilation and air conditioning (HVAC)" (`1V1`), and some of those still show. Seen: "Renew the air-conditioning compressor", "Renew the air-conditioning condenser", compressor bracket and clutch. They need refrigerant, so most go to "Get a quote". **They stay visible.** I hid them that day, then took the hides out again: Brad meant only the regas ("unless hes turned this off himself … we shouldnt be hiding unless they were already hidden - i was on about the regassing"). The regas itself (`1V00050000WV0` Drain/refill) has been hidden for every car since 2026-09-04.

**What manufacturers put in an EV service** (HaynesPro maintenance schedules, `getMaintenanceSystemsV7` / `getMaintenanceTasksV9` / `getMaintenancePartsForPeriod`, on the licence but not wired into the app): Leaf every 12 months / 30,000 km at 1.3–1.4 h; Puma Gen-E every 24 months at 1.1 h. Replaced: pollen filter (424) every service; brake fluid (3357) every 24 months; coolant (3356) only at 5 years or more (Leaf) or 10 years (Puma), on the battery/inverter circuit, which `fluid-capacity.ts` deliberately doesn't read. Everything else is checks: brakes, steering, suspension, drive shafts, high-voltage cooling leaks, lights, wipers. If it's ever wanted: HaynesPro's capacities carry "Refrigerant = 460 ± 15 (g)" rows, headed "With R134a / R1234yf refrigerant" (fixtures `capacities-301000817.json`, `-619114949.json`), and NAPA lists nothing for part type 1442. The removed code is in commit `8259a46`.

## 3. Discount code on the payment page

The payment step (where "To pay" is) now has "Have a discount code?" too, as well as the step before. Applying it re-prepares the checkout with the code (a fresh intent for the new amount; `Elements` is keyed on the client secret so it remounts). It's hidden once the card is authorised, because the hold is for the amount shown. Enter in the box applies the code rather than submitting the card.

## Acceptance

- [x] A basket with a HaynesPro job and a service saves its lines (row shape checked against the live table)
- [x] Revisions write lines the same way
- [x] EV service and Air con regas created (switched off, £0)
- [x] Discount code on the payment step, before the card is authorised
- [x] Both switched on at £0 so Gareth can see them live (Brad, 2026-11-23). Interim and Full service set to petrol + diesel at the same moment. Checked on the live site: the Leaf and Puma see EV service (£17.28 / £24.12, the pollen filter only) and Air con regas (£0). The S-Max hybrid still sees Interim, Full and Major.
- [x] **EV major service** created (Brad, 2026-11-23), electric only, £0, switched on: pollen filter + brake fluid (NAPA, by HaynesPro's litres), 1.5 h, shown every two years. EV service's wording now says yearly. Live: Leaf £17.28 / £28.49, Puma £24.12 / £78.80.
- [x] **Puma brake fluid overpriced (£54.68).** NAPA lists only Febi fluids for BD26HXH, described just "BRAKE FLUID" with no size, in the quote and in product info. So the 1.0 L HaynesPro need can't pick a bottle and the default (dearest, FEB171875 £45.57) applies. The Leaf's are sized ("DOT 4 BRAKE FLUID 1LTR") and price at £11.21. **Fixed with a rule** (Brad chose it over a per-model pick): when no brake fluid NAPA lists for a car states a size, the cheapest bottle within the best rating is charged, not the dearest (`unsizedBrakeFluid` in `lib/parts/repair-part-choice.ts`). Across all 27 cached cars only Febi's range is unsized (BD26HXH, S28BSW). Sized NAPA brake fluid is £9.34–£25.12 for 1 litre and £33+ for 5 litres. The Puma now takes FEB171876 at £7.58 cost. Live once pushed.
- [ ] Brad sets real prices on EV service, EV major service and Air con regas (both bookable at £0 / pollen-filter-only until then)
- [x] "EVs not recognised" (BD26HXH, FN72RMO, EA23XLW, checked 2026-11-23): all three match HaynesPro on the live site (Puma Gen-E, Leaf ZE1, S-Max 2.5 FHEV) with full repair data. The real fault: a pure EV's Servicing offered only Interim and Full service (no fuel set), and both went to "Get a quote" because NAPA has no oil filter for an electric car, so an EV had no bookable service. Fixed by switching on the EV service and setting Interim + Full to petrol + diesel, both at the same moment (the two boxes above). EA23XLW is a petrol hybrid and prices all three services normally. It had never been matched before, so an earlier failure was probably a passing HaynesPro error (failures are remembered for a few minutes).
