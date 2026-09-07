-- Task 28 — a customer can offer SEVERAL all-day dates and let the mechanic
-- pick one.
--
-- `candidate_days` is the set of UK calendar days the customer is happy with,
-- as plain dates. It is set ONLY on an all-day booking
-- (`slot_window = 'All day (8am–8pm)'`) with two or more distinct days, and
-- only while the offer is still open:
--
--   • `scheduled_at` stays 8am on the EARLIEST candidate day, so ordering,
--     day grouping, the 24-hour cancellation-fee boundary, the crons and the
--     mobile app (which reads the row raw) all keep working unchanged.
--   • When the mechanic picks a day + 2-hour window (`setArrivalWindow`),
--     `scheduled_at` moves to that window's start, `slot_window` to its label
--     and `candidate_days` goes back to NULL. The offered set is kept in the
--     `arrival_window_set` event payload.
--   • Any path that clears `slot_window` (customer reschedule, accepted
--     mechanic proposal) clears `candidate_days` too.
--
-- NULL = a normal booking. Additive; nothing existing changes shape.
alter table public.bookings
  add column if not exists candidate_days date[];

alter table public.bookings
  drop constraint if exists bookings_candidate_days_shape;
alter table public.bookings
  add constraint bookings_candidate_days_shape
  check (candidate_days is null or array_length(candidate_days, 1) >= 2);
