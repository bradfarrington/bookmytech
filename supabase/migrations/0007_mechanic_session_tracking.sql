-- 0007_mechanic_session_tracking.sql
-- Task 05 Stage 1 — mechanic dashboard session activity.
--
-- Adds two timestamps to `mechanics` so the dashboard (and admin live monitor)
-- can reason about online sessions:
--   online_at    — when the mechanic last flipped to 'online'
--   last_seen_at — bumped on any status write / dashboard heartbeat
--
-- The mechanic toggles these from their own dashboard. RLS already allows a
-- mechanic to UPDATE their own row via "Mechanics can update own status"
-- (defined in 0004) — that policy gates on the row id, not the column set, so
-- it covers these new columns too. No new policy needed.

alter table public.mechanics
  add column if not exists online_at    timestamptz,
  add column if not exists last_seen_at timestamptz;
