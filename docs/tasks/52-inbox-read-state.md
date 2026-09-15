# Task 52: Inbox (Notifications) and read state

**Status:** ✅ Built (2026-09-15): migration `0075_customer_inbox_reads.sql`, `lib/inbox/`, `/dashboard/inbox` and the header's unread dot. Waiting on `0075` being applied. Until then, "Mark all read" is hidden and read state doesn't persist.

## Why

The redesigned app has an Inbox (`mockups/02-dashboard-reminders.html`, "Notifications"). The app keeps read state in one device's storage, so a customer with two phones, or the website, sees the same news as unread twice.

## Design

- **No notifications table.** The feed is assembled from what a customer can already read, exactly as the app does: `booking_events` on their bookings, from an allow-list, plus the `reminder_schedules` rows sent to them.
- **`lib/inbox/events.ts`** is the website's copy of the app's event allow-list and wording.
- **`customer_inbox_reads` (0075)** holds one row per customer, with the app's own model:
  - `read_before`: "Mark all read"
  - `read_ids`: items opened since, capped at 200
  - anything older than 7 days counts as read
- **Writes go through two functions**, so two devices can't overwrite each other: `mark_inbox_item_read(p_item_id)` and `mark_inbox_all_read()`. Both run as the caller.
- **`lib/inbox/read-state.ts`** holds the unread rules, and is unit-tested.
- **Account deletion** removes the row (`0077`).

## Acceptance criteria

- [ ] `0075` applied (owner)
- [x] Reading something on one device marks it read everywhere
- [x] Two devices marking items read at the same moment both stick
- [x] Before `0075`, the feed still loads and nothing errors
- [x] Website Notifications page with All / Bookings / Reminders tabs, day groups, unread dots and Mark all read (Task 48)
- [x] Unread indicator in the website's header (Task 48)

## Mobile app

- Run `npm run db:types`.
- `src/lib/inbox.ts`:
  - **Load read state:** `from('customer_inbox_reads').select('read_before, read_ids').maybeSingle()`; no row means nothing read.
  - **Opening an item:** `rpc('mark_inbox_item_read', { p_item_id: item.id })`, where ids are the existing `event:<uuid>` and `reminder:<uuid>`.
  - **"Mark all read":** `rpc('mark_inbox_all_read')`.
  - **Offline:** keep AsyncStorage as a fallback, or drop it.

## When complete

Tick the boxes above, set the Status line, update `docs/HANDOFF.md`, commit.
