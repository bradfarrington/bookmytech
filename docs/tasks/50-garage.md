# Task 50: The garage (saved vehicles)

**Status:** 🚧 Backend built (2026-09-15): migration `0073_customer_vehicles.sql`, `lib/garage/`, `GET` and `POST /api/mobile/v1/garage`, and bookings adding their vehicle. The website's Garage page ships with Task 48.

## Why

The redesigned app's Garage (`mockups/05-account-settings.html`, "Your garage") has an Add button, nicknames, MOT and tax dates, History and a ⋮ menu. Vehicles were derived from bookings on every page load, so none of that could be stored, and each device looked every vehicle up with DVLA itself.

## Design

**Table `customer_vehicles` (0073)**
- `registration` is stored uppercase with no spaces ("S28BSW"), unique per customer.
- `nickname`, up to 30 characters.
- DVLA details: `make`, `model`, `colour`, `fuel_type`, `year_of_manufacture`, `mot_status`, `mot_expiry_date`, `tax_status`, `tax_due_date`, and `details_checked_at`.

**Who writes what**
- **Adding** goes through the server, which checks the registration with DVLA first (`addToGarage`). Customers have no INSERT grant.
- **DVLA columns** are server-written only. Customers are granted UPDATE on `nickname` alone, so the MOT warning is always DVLA's date.
- **Rename and remove** are direct under RLS, from either client.
- **Bookings:** a signed-in booking adds its vehicle if it isn't already there (`recordBookedVehicle` in `createBooking`), never failing the booking.
- **Backfill:** the migration seeds every customer's garage from their past bookings.

**DVLA refresh** (`lib/garage/status.ts`, unit-tested)
- A vehicle is re-checked weekly, or daily once its MOT or tax is within 30 days or past.
- At most 6 are refreshed per view.
- A "not found" answer counts as checked. A rate limit or network failure doesn't.

**Limits:** 20 vehicles per customer. The mobile endpoints count against the new `account` rate-limit family (seeded in `0076`).

## Acceptance criteria

- [ ] `0073` applied (owner)
- [x] A customer's past bookings appear in their garage after the migration
- [x] Adding a registration checks it with DVLA and stores MOT and tax dates; adding one that's already there returns it
- [x] A customer can rename and remove their own vehicles, but can't write DVLA columns or add rows directly
- [x] A signed-in booking adds its vehicle
- [x] Account deletion removes the garage (`0077`)
- [ ] Website Garage page with Add, nickname, MOT warning, Book, History and remove (Task 48)

## Mobile app

- Run `npm run db:types`.
- **List:** `GET /api/mobile/v1/garage` returns `{ available, vehicles: [...] }`. Details are already refreshed, so the app can drop its own 24-hour DVLA cache (`garageDetails` in `src/lib/garage.ts`). Dates are "YYYY-MM-DD".
- **Add:** `POST /api/mobile/v1/garage` with `{ registration, nickname? }` returns `{ ok: true, vehicle, alreadySaved } | { ok: false, error }`.
- **Rename:** `from('customer_vehicles').update({ nickname }).eq('id', id)`.
- **Remove:** `from('customer_vehicles').delete().eq('id', id)`.
- **History:** the vehicle's bookings, as today (`lastJobFor`).

## When complete

Tick the boxes above, set the Status line, update `docs/HANDOFF.md`, commit.
