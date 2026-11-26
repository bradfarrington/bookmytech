# Task 86: Repair manuals and technical data in the mechanic app

**Status:** ✅ Complete (2026-11-26). Three read-only mobile routes over the same HaynesPro reads as the website's `/mechanic/jobs/[id]/technical` (Task 27); the mechanic app gained the job page's "Technical data" card and three screens. No migration. Additive API only. **Not exercised against live HaynesPro data this session.**

Brad (2026-11-26, from mechanic app build 8): "we need to add these into the jobs like they are on web which pull through the relevant information from haynespro into the app". The website's job page has had the card since Task 27; the app had nothing.

## What shipped

- **`lib/mechanics/technical-data.ts`:** `jobManualsFor`, `jobManualFor`, `jobTechnicalDataFor`. Ownership through `ownedBooking`; the booking's reg resolved with `resolveVehicle` (the funnel's cached path, as the website page); then `getStoryList` / `getStory` / `getAdjustments` / `getCapacities` / `getIdLocations` from `lib/haynespro/tree.ts`. HaynesPro payloads are **mapped to our own shapes** (`TechnicalStoryLine { name, text, remark, imageUrl, lines }`, `TechnicalDataRow { name, value, unit, remark, rows }`), so a HaynesPro API version change cannot break an installed app.
- **Routes** (all `GET`, `mechanicfeed` bucket, 403 not your job, 404 no such job):
  - `/api/mobile/v1/mechanic/bookings/[id]/technical/manuals` → `{ matched, vehicle, manuals: [{ storyId, name }] }`
  - `/api/mobile/v1/mechanic/bookings/[id]/technical/manuals/[storyId]` → `{ name, lines }` (404 when the car doesn't match or the manual doesn't load)
  - `/api/mobile/v1/mechanic/bookings/[id]/technical/data` → `{ matched, vehicle, adjustments, capacities, idLocations }`
  - `matched: false` (no HaynesPro configured, no reg, reg didn't resolve) is a 200 with empty lists; the app explains it.
- The website page is unchanged.

## Acceptance criteria

- [x] The assigned mechanic can list a job vehicle's repair manuals and open one, with nested lines, remarks and pictures
- [x] Adjustments & specifications, capacities and VIN/ID-plate locations for the job's vehicle
- [x] Another mechanic's job → 403; an unmatched vehicle → an explanation, not an error
- [x] `tsc` and lint clean

## Mobile apps

- **Mechanic app** (`bmt-mechanic-app`): "Technical data" card on the job page (not on cancelled jobs) → `jobs/[id]/manuals` → `jobs/[id]/manual`, and `jobs/[id]/technical`. Needs this CRM deployed first, then an EAS build.
- **Customer app:** nothing.

## Follow-ups

- Pictures are HaynesPro's JPEG/SVGZ URLs rendered with `expo-image`; check an SVGZ diagram draws on both platforms on the first build.
- Pinch-to-zoom on a manual's pictures.
