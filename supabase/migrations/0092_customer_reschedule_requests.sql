-- 0092_customer_reschedule_requests.sql
-- A customer's new time on a CONFIRMED booking becomes a request to the
-- accepted mechanic, not a move.
--
-- Until now the customer's reschedule applied at once and only emailed the
-- mechanic. That let a customer push a booking a few days out and then cancel
-- inside the cheaper fee tier the move had just bought them. Now the booking
-- keeps its time — and so its cancellation tier — until the mechanic accepts.
-- The mechanic can accept, decline, or counter with a time of their own, which
-- is the existing mechanic proposal (reschedule_status 'proposed') the customer
-- already answers.
--
-- Both directions share the one set of reschedule_* columns, since only one
-- proposal can be open at a time; this adds who made it, and the arrival
-- window a customer asked for. A booking still finding a mechanic has nobody
-- to ask, so its time still changes directly (lib/bookings/manage-booking.ts).
--
-- Idempotent: safe to re-run.

alter table public.bookings
  add column if not exists reschedule_proposed_by text
    check (reschedule_proposed_by in ('mechanic', 'customer')),
  -- The 2-hour arrival window the customer asked for ("2pm–4pm"), kept when
  -- the request is accepted. Null for an exact time, and always null on a
  -- mechanic's proposal.
  add column if not exists reschedule_proposed_window text;

comment on column public.bookings.reschedule_proposed_by is
  'Who made the open reschedule proposal: ''mechanic'' (the customer answers) or ''customer'' (the mechanic answers). Null on a proposal made before 0092 — read it as ''mechanic''.';

-- Events: two new types. Accepting and declining reuse 'reschedule_accepted' /
-- 'reschedule_declined' with actor_role 'mechanic'; a counter reuses
-- 'reschedule_proposed'. The list is 0064's plus these.
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
    'reschedule_requested',
    'reschedule_withdrawn',
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
    'arrival_window_set',
    'fault_added',
    'quote_sent',
    'quote_approved',
    'quote_declined',
    'quote_withdrawn',
    'quote_expired',
    'revision_sent',
    'revision_approved',
    'revision_declined',
    'revision_withdrawn',
    'revision_expired'
  ));
