# Task 83: NAPA parts on manually added services

**Status:** ⏳ Proposed (2026-11-20). Waiting on Brad/Gareth's answers to the questions below. Nothing built.

Brad, 2026-11-20: "for the services weve added manually like the diagnostics or something else that needs oil for example - can we get those to price up for the parts from napa aswell please and if so how will we do it"

## How it works today

The services added by hand (diagnostics, servicing, inspections, DPF cleans) are `catalogue_products` rows. Each has a fixed price or set labour hours. The only extra a service can carry is engine oil, charged at the £/litre setting × the oil capacity HaynesPro gives for the car. No NAPA parts are involved.

Repairs are different: each HaynesPro job lists its part types, and `quoteJobParts` prices those from NAPA for the exact car.

## Proposed approach

1. **Choose parts per service in the admin.** On each service's edit page, add a "NAPA parts" picker where part types are chosen by name, e.g. Full service = oil filter + air filter + pollen filter; Major (petrol) = those + spark plugs. One migration adds a list of part-type ids to `catalogue_products`.
2. **Price them like a repair.** When a quote is built, each service goes into the same `quoteJobParts` call as the repairs (`lib/haynespro/repair-booking.ts`), so a service automatically gets:
   - the right part for that reg, in the right quantity (e.g. every spark plug)
   - the parts markup switch (Task 82)
   - Gareth's per-model part picks
   - parts saved on the booking, so the mechanic sees what to buy
   - the "Get a quote" fallback
3. **Show the price in the list.** The Servicing list prices these rows the same way the repair list does, with the animated logo until the price is ready.

The oil filter is low-risk: NAPA is already asked for the oil and air filter on every car (to work out the engine code).

## Questions to answer before building

- [ ] **Do the current service prices already include the filters?** If yes, each fixed price must drop to labour only, or customers pay for the filters twice. Gareth needs to set the new figures.
- [ ] **What if NAPA can't price a part for a car?** The repair rule is "Get a quote". For a service, that would remove a basic booking for that car. Alternative: fall back to the old all-in fixed price. Which?
- [ ] **Should engine oil keep using the £/litre setting?** Recommended for now. Buying oil from NAPA is harder: it must match the car's oil spec (grade and manufacturer approval) and has the same bottle-size problem as brake fluid. Would want a few read-only NAPA lookups on a couple of regs before deciding.
- [ ] **Which services actually need parts?** Diagnostics normally use none. If the idea is an oil change or filter service, say which ones.

## App impact (when built)

- The migration means regenerating types in both apps (`npm run db:types`).
- Service prices customers see would change — a pricing change.
- A service quote would start including part lines. They use the existing part fields, so the change is additive, but check that the customer app shows part lines under a service and that the service price in the app's list is the total including parts.
