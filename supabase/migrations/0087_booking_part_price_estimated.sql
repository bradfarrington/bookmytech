-- 0087_booking_part_price_estimated.sql
-- Task 72 — mark a booking part whose price was estimated.
--
-- ⚠️ SCHEMA CHANGE — the mobile apps generate their TypeScript types from the
-- live schema, so `npm run db:types` must be re-run in both after this
-- applies. The mechanic app reads booking_parts directly under RLS.
--
-- When Alliance Automotive has no price for a part on a car (common on new
-- models), the part is priced from what AAG charged for the same part group on
-- other cars of the same make and model (any year), plus a margin (owner decision, 2026-10-09). The
-- booking still goes out with one full price; this flag tells the mechanic and
-- admin which part lines are estimates, so the mechanic buys a suitable part
-- and quotes the customer for any difference if it costs more.
--
-- Additive, defaults false: every existing row and every pre-Task-72 writer is
-- unaffected. Until it is applied the app saves estimated parts without the
-- flag (lib/parts/quote-parts.ts insertCatalogueBookingParts).
--
-- Idempotent: safe to re-run.

alter table public.booking_parts
  add column if not exists price_estimated boolean not null default false;

comment on column public.booking_parts.price_estimated is
  'True when this catalogue part''s price was estimated from other cars of the same make and model because no supplier priced it for this vehicle (Task 72). The mechanic buys a suitable part; a dearer one goes through an extra-cost quote.';
