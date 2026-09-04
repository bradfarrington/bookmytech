# Task 27 — Mechanic's repair manuals and technical data, inside the app

**Status:** ✅ Complete (2026-09-04) — merged to `main` 2026-09-04 (branch `task-24-multi-repair-bookings`). No migration. `tsc`, build and lint clean. **Not exercised in a browser this session.**

## Why this exists

Brad (2026-09-04): "when we've got a booked job and we're looking at it as the mechanic, the documents inside the job, like the manuals, take you to HaynesPro's website rather than showing them inside the mechanic's view. We don't want to be sending anyone to HaynesPro." Task 16 Stage F built the job page's "Technical data" card as one-time SSO deep links into WorkshopData Touch (the spec's reasoning: "don't rebuild in BMT — deep-link via SSO"), while Stage E rendered the same manuals and technical data *in-app* for the admin model page. This task points the mechanic at the in-app version.

## What shipped

- **`components/haynespro/technical-panels.tsx`** — `ManualsPanel` (manual list → story viewer with nested lines, remarks and images) and `DataPanel` (adjustments & specifications, capacities, VIN/ID-plate locations), extracted verbatim from the admin model page, which now imports them. `ManualsPanel` takes the two hrefs it needs rather than the admin page's URL shape.
- **`/mechanic/jobs/[id]/technical?tab=manuals|data`** — the mechanic's own booking (their RLS), its reg resolved to the HaynesPro car type through the same cached path the funnel priced it with, two tabs, "Back to job". A vehicle that doesn't resolve gets a plain explanation.
- **Job page card** — "Repair manuals" and "Technical data" now link there. The card shows when the Data Exchange credentials are configured (it used to key on the SSO ones). The "Wiring & electronics" button is gone: that data (VESA) was only ever available through SSO, and nothing is sent out any more. `GET /api/haynespro/sso` still exists but nothing in the mechanic UI links to it.

## How to verify

1. As the assigned mechanic, open a job → "Technical data" card → **Repair manuals** → the list of manuals for the booking's car renders in the dashboard; open one → nested lines and images; "All manuals" goes back; "Back to job" returns.
2. **Technical data** tab → adjustments (collapsible), capacities, ID-plate locations.
3. Another mechanic's job id → 404. A booking whose reg doesn't resolve → the explanation, no crash.
4. `/admin/vehicles` → any model → Manuals and Technical data tabs unchanged.

## Follow-ups

- Wiring diagrams / electronics (VESA) in-app would need the VESA operations wiring up (`HaynesPro Data Exchange V3 – 24.4.1-WS0 – VESA.pdf` at the repo root); not started.
- Retire `app/api/haynespro/sso/route.ts` and `lib/haynespro/sso.ts` once nothing else wants them.

## Mobile app (per AGENTS.md)

Nothing — mechanics are not in the customer app; no migration.
