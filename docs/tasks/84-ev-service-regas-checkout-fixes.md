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

Refrigerant by weight (HaynesPro's grams × a £/100 g setting per gas) was built, then taken out the same day. Brad: "the air con regas wont be pulling prices it will be a fixed price like we have done for the pre purchase inspections". Every HaynesPro air-con job is already hidden for all cars, since the whole "Air conditioning" group (`1V00000000G`) got a global hide on 2026-11-18. That includes HaynesPro's own regas ("Drain/refill the air-conditioning system"), and no model shows any of it. So nothing was left for by-weight pricing to price. If it's ever wanted: HaynesPro's capacities carry "Refrigerant = 460 ± 15 (g)" rows, headed "With R134a / R1234yf refrigerant" (fixtures `capacities-301000817.json`, `-619114949.json`), and NAPA lists nothing for part type 1442. The removed code is in commit `8259a46`.

## 3. Discount code on the payment page

The payment step (where "To pay" is) now has "Have a discount code?" too, as well as the step before. Applying it re-prepares the checkout with the code (a fresh intent for the new amount; `Elements` is keyed on the client secret so it remounts). It's hidden once the card is authorised, because the hold is for the amount shown. Enter in the box applies the code rather than submitting the card.

## Acceptance

- [x] A basket with a HaynesPro job and a service saves its lines (row shape checked against the live table)
- [x] Revisions write lines the same way
- [x] EV service and Air con regas created (switched off, £0)
- [x] Discount code on the payment step, before the card is authorised
- [ ] Brad sets the two services' prices and switches them on
- [ ] Interim and Full service set to petrol + diesel once the EV service is live (they currently show for EVs, with oil)
- [ ] EV registrations HaynesPro doesn't recognise: waiting on example regs from Brad
