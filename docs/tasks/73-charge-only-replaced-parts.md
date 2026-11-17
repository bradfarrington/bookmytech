# Task 73: Charge only the parts a job actually replaces

**Status:** ✅ Complete (2026-11-17): the wording rule, on for every car, and part-or-kit pairs charged once. Code is in `lib/parts/job-charges.ts`; the effect is listed job by job in `docs/tasks/73-job-changes.md` for review before release. Deviations from the plan: the per-job admin switch (proposal 2) wasn't built, because Brad chose the automatic rule. Remove/refit jobs also keep their gaskets, seals and bolt sets (found in the review list). A part type listed twice on one job (two "Brake fluid" ids) is charged once.

## The problem

HaynesPro doesn't say which parts a job **replaces**; it tags each job with the part types it **involves** (TecDoc GenArt ids). "Check the battery connections and fluid level" involves the battery, so it carries the same "Starter battery" tag as "Renew the battery".

Our pricing (Task 43, `lib/parts/quote-parts.ts`) charges **every** tagged part type unless an admin switches that part type off. That's right for "Renew…" jobs and wrong for jobs that only inspect, charge, top up, or remove and refit a part.

The existing switch (`part_group_settings.charged`) can't fix it, because it applies per part type to every job on every car. Switching "Starter battery" off would also take the battery off "Renew the battery". The problem is per job, not per part type.

## Examples found (2026-10-09, AAG sandbox)

**FN60KYP (2010 Ford Fiesta 1.4):**
- "Check the battery fluid level; top up if necessary": £60 + **£89.22** (Varta battery)
- "Check the battery connections and fluid level": £60 + **£89.22** (battery)
- "Charge the battery using a charging station": £60 + **£89.22** (battery)
- "Charge the battery": £60 + **£89.22** (battery)
- "Check the starter motor signal": £60 + **£72.22** (starter motor)
- "Check the throttle body": £60 + **£227.18** (throttle body)
- "Check the operation of the coolant pump; check the condition": £60 + **£47.43** (water pump)
- "Check the clutch for damage and wear": £60 + **£66.48** (clutch kit)
- "Check/top up the clutch fluid level" and "Check/top up the brake fluid level": a full brake fluid each

**S28BSW (2024 Ford Ranger):**
- "Renew the engine earth cable": £174.75 battery
- "Check/top up the coolant level": a full antifreeze (£47.26)

**Related, different cause (HaynesPro lists alternatives side by side):**
- CV-boot jobs charge both "Bellow, drive shaft" and "Bellow kit, drive shaft", so the customer pays twice.
- Wheel-bearing jobs charge both "Wheel bearing kit" and "Wheel bearing".
- "Both windscreen wiper blades" sometimes charges one blade, and sometimes two different blade types.

## Proposed fix (to agree before building)

1. **A rule based on the job's wording, applied to every car automatically.** Jobs whose description starts with "Check", "Charge", "Test", "Adjust", "Inspect", "Clean", "Bleed", "Top up" or "Remove/refit" don't charge parts. Only jobs that renew, replace or fit something do.
   - Open question: "Check/top up …" and "Drain/refill the cooling system" use a consumable (fluid), so they probably *should* charge one, perhaps at a set top-up quantity or price rather than a full fill.
2. **A per-job switch in the admin.** On a repair, choose which of its tagged part types are charged, e.g. "Check the battery: don't charge Starter battery". HaynesPro job ids are the same repair on every make (`lib/haynespro/exclusions.ts` header), so one setting covers every car. It overrides the wording rule both ways.
3. **Alternatives charged twice** (bellow vs bellow kit, bearing vs bearing kit): when a job carries two part types that are alternatives, charge one. This could be a per-job choice (same admin switch) or a small list of known alternative pairs.

## Brad's answers (2026-11-17)

- Top-ups: **keep a full fill**, as now.
- The wording rule: **on from day one**, with a list of every changed job to review first (`73-job-changes.md`).
- Part and kit side by side: **charge one, automatically**: the kit when NAPA prices it, otherwise the single part.

## Questions for Brad (answered above)

- Should top-ups charge a fraction of a fill, a set price, or nothing?
- Should the wording rule be on from day one, or only the per-job switch?
- Who reviews the list of jobs the wording rule would change before it goes live?

## Acceptance criteria (draft)

- [x] Battery check and charge jobs on FN60KYP price as labour only.
- [x] "Renew the battery" still charges the battery.
- [ ] An admin can switch a part type off for one repair on every car, and back on. Not built: Brad chose the automatic wording rule instead. The existing per-part-type "not charged" switch still works.
- [x] CV-boot and wheel-bearing jobs charge one part, not both alternatives.
- [x] A report of every job whose price changes: `73-job-changes.md` (178 jobs; awaiting Brad's review before release).
- [x] Mobile contract unchanged: only the figures change. Repair-tree `genartIds` now lists only the part types a job charges, so a "Check…" job has none and the apps show a plain price instead of "+ parts". Prices for these jobs drop.
