-- Store the customer's chosen arrival window on the booking.
--
-- `scheduled_at` holds the window *start* (used for ordering / day-grouping);
-- `slot_window` is the human-facing arrival window the customer picked in the
-- booking flow ("8am–10am" … "6pm–8pm", or "All day (8am–8pm)"). A 2-hour
-- window and the all-day window can share the same start time, so the window
-- text is what the customer and mechanic actually see.
--
-- Nullable: legacy bookings (and the old morning/afternoon/evening slots) have
-- no window; display code falls back to the exact start time for those.
alter table public.bookings
  add column if not exists slot_window text;
