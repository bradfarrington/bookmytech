# Task 49: Saved addresses

**Status:** ✅ Built (2026-09-15): migration `0072_customer_addresses.sql`, `lib/addresses/`, the Addresses screens (`/dashboard/settings/addresses`, `/new`, `/[id]`) and saved addresses on the booking flow's Address step. `0072` applied 2026-09-15. On the Address step, only customer sessions are offered addresses, and when a postcode was already given only a saved address at that postcode is pre-filled.

## Why

The redesigned app has an Addresses screen (`mockups/05-account-settings.html`, "Addresses"), and its booking flow can offer saved addresses on the Address step. Until now an address only existed on each booking.

## Design

**Table `customer_addresses` (0072)**

| Column | Notes |
|---|---|
| `id`, `customer_id` | `customer_id` references `profiles`, cascade |
| `label` | "Home", "Mum's". 1 to 40 characters |
| `kind` | `home` / `work` / `other`: picks the card's icon |
| `note` | Short line under the label, up to 80 characters |
| `address_line_1`, `address_line_2` | Up to 120 characters each |
| `postcode` | Full UK postcode, stored as "NG12 7GG" |
| `parking_type` | `driveway` / `street` / `car_park` / `other`, or null |
| `special_instructions` | Up to 500 characters |
| `is_default` | One per customer |
| `created_at`, `updated_at` | |

- **The app writes to the table directly**, so the table is its own validation. The limits are CHECKs, and a trigger trims text and fixes postcode spacing (`normalise_uk_postcode`).
- **One default, kept by triggers.** The first address saved becomes the default, making another the default clears the old one, and deleting the default promotes the most recently updated one left. "Set as default" is one update of one row.
- **20 addresses per customer**, raised by the trigger with a sentence for customers (code `P0001`).
- **RLS:** the customer selects, inserts, updates and deletes their own rows; admins can read.
- **Account deletion** removes them (`0077`).
- **Website:** `lib/addresses/validate.ts` (shared shape, checks, row mapping; unit-tested) and `lib/addresses/store.ts` (list, save, delete, set default through the caller's own client).

## Acceptance criteria

- [x] `0072` applied (owner, confirmed 2026-09-15)
- [x] A customer can list, add, edit, delete and set a default on their own addresses under RLS, and can't read anyone else's
- [x] A postcode typed without its space is stored with it; a district on its own is refused
- [x] Exactly one default whenever a customer has any addresses
- [x] Account deletion removes them (`0077`)
- [x] Website Addresses page (Task 48)
- [x] The booking flow's Address step offers saved addresses (Task 48)

## Mobile app

- Run `npm run db:types`.
- `src/lib/addresses.ts`:
  - **List:** `from('customer_addresses').select(...)`, ordered by `is_default` descending then `created_at`.
  - **Add:** insert with `customer_id` set to the signed-in user's id.
  - **Edit and delete:** update or delete by `id`.
  - **Set as default:** update `{ is_default: true }`; the trigger clears the old default.
  - **Errors:** the 21st insert fails with code `P0001` and the message "You can save up to 20 addresses. Remove one to add another.", which can be shown as it is.
- Offer saved addresses on the booking flow's Address step.

## When complete

Tick the boxes above, set the Status line, update `docs/HANDOFF.md`, commit.
