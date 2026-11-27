-- ---------------------------------------------------------------------------
-- 0093 — Parts that depend on the car's equipment (Task 87)
--
-- NAPA lists some parts in two versions, for cars with and without air-con
-- (an Astra K 1.0: Gates 5PK1680 with, 5PK1650 without) or stop-start, and
-- says which is which. Nothing we look up says what a car has. So:
--
--   • The customer is asked, only when it changes a part: "Does your car have
--     air conditioning? Yes / No / Not sure". The answer is kept on the
--     booking (it prices the mechanic's extra work and follow-on quotes on the
--     same car) and on the customer's saved car, so they're asked once.
--   • Unanswered ("Not sure", or an app build that doesn't ask), the part is
--     priced at the dearer version. Either way the mechanic is told every
--     version and what the customer said, on the booking's part line:
--     booking_parts.fit_options.
--
-- All columns are nullable and new: null means "not asked / not known", which
-- is every row that exists today.
--
-- WHO WRITES WHAT: the server, at booking (and when a revision adds parts).
-- Customers and mechanics read these columns through the existing RLS row
-- policies; neither is granted UPDATE on them.
--
-- ⚠️ SCHEMA CHANGE: both apps regenerate their types (`npm run db:types`).
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

alter table public.bookings
  add column if not exists car_air_con boolean,
  add column if not exists car_stop_start boolean;

comment on column public.bookings.car_air_con is
  'Task 87. Whether the car has air-con, as the customer said when booking. Null: not asked, or "Not sure". Decides between NAPA''s +AC / -AC parts.';
comment on column public.bookings.car_stop_start is
  'Task 87. Whether the car has stop-start, as the customer said. Null: not asked, or "Not sure".';

alter table public.customer_vehicles
  add column if not exists air_con boolean,
  add column if not exists stop_start boolean;

comment on column public.customer_vehicles.air_con is
  'Task 87. The customer''s last answer for this car: has air-con. Server-written from a booking. Null: never answered.';
comment on column public.customer_vehicles.stop_start is
  'Task 87. The customer''s last answer for this car: has stop-start. Server-written from a booking. Null: never answered.';

-- 0073 revoked UPDATE on customer_vehicles and granted back `nickname` only,
-- so the new columns are already server-written. Nothing to grant.

alter table public.booking_parts
  add column if not exists fit_options jsonb;

comment on column public.booking_parts.fit_options is
  'Task 87. Null unless NAPA lists this part in versions for cars with and without air-con or stop-start. Then '
  '{ "dependsOn": ["air_con" | "stop_start"], "options": [{ "supplier", "partNumber", "brand", "description", '
  '"for": { "air_con": true }, "label": "With air-con" }], "answered"?: { "air_con": true } }. With the customer''s '
  'answer the line is that version; without, the dearest, and the mechanic checks the car (or asks) before buying.';
