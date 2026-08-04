-- ---------------------------------------------------------------------------
-- Rate limits for the authenticated mobile booking endpoints (Task 18 Stage 3):
--   POST /api/mobile/v1/checkout/prepare
--   POST /api/mobile/v1/bookings
--
-- DATA ONLY — no schema change. This inserts rows into platform_settings; it
-- adds no table, column or type, so nothing here affects the TypeScript types
-- the mobile app generates from the schema.
--
-- Same mechanism and reasoning as 0043 and 0044: values live in
-- platform_settings so they are tunable in the database with no redeploy, and
-- lib/rate-limit/limiter.ts falls back to identical defaults in code, so the
-- endpoints are still limited if this seed hasn't been applied.
--
-- These buckets are SEPARATE from the catalogue ones on purpose. Browsing
-- repairs and paying for one must not share a budget, or a customer who spent a
-- while looking around would be turned away at the payment step — the single
-- worst moment to show someone "please wait a moment".
--
-- Both endpoints require a Bearer token, so the per-user bucket is the real
-- limit and the per-IP one is an abuse ceiling for a single attacker cycling
-- accounts. Per-IP stays generous because mobile carriers put many genuine
-- customers behind one CGNAT address.
--
-- Checkout is the looser pair: an unconfirmed PaymentIntent costs nothing and
-- expires on its own, so the concern is a loop burning metered HaynesPro quote
-- credit and filling the Stripe dashboard, not a direct bill. Going back and
-- forward at the payment step must never trip it.
--
-- Booking create is the tighter pair: every call writes a row, dispatches to
-- mechanics and sends an email and an SMS. A loop there is noisy in people's
-- actual jobs list, not just in a table. A real customer books once, sometimes
-- twice.
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value) values
  ('mobile_checkout_user_burst', '10'::jsonb),   -- per user, per 60s
  ('mobile_checkout_user_daily', '60'::jsonb),   -- per user, per 24h
  ('mobile_checkout_ip_burst',   '20'::jsonb),   -- per IP,   per 60s
  ('mobile_checkout_ip_daily',   '300'::jsonb),  -- per IP,   per 24h
  ('mobile_booking_user_burst',  '5'::jsonb),    -- per user, per 60s
  ('mobile_booking_user_daily',  '25'::jsonb),   -- per user, per 24h
  ('mobile_booking_ip_burst',    '10'::jsonb),   -- per IP,   per 60s
  ('mobile_booking_ip_daily',    '100'::jsonb)   -- per IP,   per 24h
on conflict (key) do nothing;
