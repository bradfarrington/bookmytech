-- 0009_mechanic_job_actions.sql
-- Task 05 Stage 4 — mechanic job-detail view: cancel + reschedule.
--
-- The mechanic detail page lets the assigned mechanic cancel a confirmed job
-- (re-dispatched to other mechanics via the standard broadcast offer) or
-- propose a new time. Both write a booking_event for the audit timeline; cancel
-- also persists the reason directly on the booking so it shows in the
-- mechanic's + admin's job history without walking the event log.
--
-- No new RLS policies: mechanics have no UPDATE/INSERT rights on bookings or
-- booking_events. The cancel/reschedule server actions (app/actions/mechanic-jobs.ts)
-- verify the caller is the *assigned* mechanic, then write via the service-role
-- client — the same privileged-write pattern as accept/decline (job-offers.ts).

-- ---------------------------------------------------------------------------
-- Booking columns.
-- ---------------------------------------------------------------------------
alter table public.bookings
  -- Customer contact number, revealed to the mechanic only once the job is
  -- en_route / in_progress (privacy gate enforced in the page). Nullable: the
  -- Task 03 checkout does not collect it yet — TODO collect at booking time so
  -- the reveal has a value. Shows "Not provided" until then.
  add column if not exists customer_phone text,
  -- Latest cancellation reason, set whenever a booking is cancelled (mechanic
  -- or admin). Mirrors the reason on the 'cancelled' booking_event.
  add column if not exists cancellation_reason text,
  -- Mechanic-proposed reschedule: the new slot + an optional note. The
  -- customer accept/decline/counter path is Task 09 — these columns hold the
  -- proposal until then. reschedule_status: null | 'proposed' | 'accepted'
  -- | 'declined'.
  add column if not exists reschedule_proposed_at timestamptz,
  add column if not exists reschedule_note text,
  add column if not exists reschedule_status text
    check (reschedule_status in ('proposed', 'accepted', 'declined'));

-- ---------------------------------------------------------------------------
-- booking_events: allow a 'reschedule_proposed' event type. Additive — keeps
-- every existing type. Re-run safe (drop + recreate the check).
-- ---------------------------------------------------------------------------
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
    'cancelled',
    'disputed',
    'payment_authorised',
    'payment_captured',
    'note'
  ));
