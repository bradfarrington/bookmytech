-- 0052_arrival_window_event.sql
-- Task 21 — a mechanic narrows an ALL-DAY booking to a 2-hour arrival window.
--
-- ADDITIVE: one new booking_events.event_type, 'arrival_window_set', written by
-- `setArrivalWindow` (app/actions/mechanic-jobs.ts) when the mechanic picks the
-- window. The booking itself changes only in columns that already exist
-- (`scheduled_at` moves to the window start, `slot_window` to its label).
--
-- No table, column or type changes. The CHECK is recreated with the same
-- drop/add pattern as 0019, 0025 and 0032; the 22 existing values are copied
-- verbatim from 0032.
--
-- ⚠️ SCHEMA CHANGE — the mobile app generates its TypeScript types from the
-- live schema, so `npm run db:types` should be re-run there after this applies
-- (a CHECK constraint isn't typed, so expect no diff — but the app's
-- booking_events renderer may now see 'arrival_window_set').
--
-- Must be applied BEFORE the code deploys: without it the audit insert fails
-- the CHECK (the action logs the error and the booking update still stands).
--
-- Idempotent: safe to re-run.

alter table public.booking_events
  drop constraint if exists booking_events_event_type_check;
alter table public.booking_events
  add constraint booking_events_event_type_check
  check (event_type in (
    'created',
    'status_changed',
    'mechanic_assigned',
    'mechanic_reassigned',
    'reschedule_proposed',
    'reschedule_accepted',
    'reschedule_declined',
    'cancelled',
    'disputed',
    'dispute_opened',
    'dispute_responded',
    'dispute_escalated',
    'dispute_resolved',
    'resolution_opened',
    'resolution_redistributed',
    'payment_authorised',
    'payment_captured',
    'payment_refunded',
    'payout_transferred',
    'payout_reversed',
    'message_sent',
    'note',
    'arrival_window_set'
  ));
