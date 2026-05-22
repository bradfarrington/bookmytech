-- Booking flow columns needed for Task 03
alter table bookings
  add column if not exists stripe_payment_intent_id text,
  add column if not exists customer_email text,
  add column if not exists customer_name text,
  add column if not exists address_line_1 text,
  add column if not exists address_line_2 text,
  add column if not exists parking_type text,   -- 'driveway' | 'street' | 'car_park' | 'other'
  add column if not exists special_instructions text;

-- RLS for bookings: customers see their own, admins see all.
-- mechanic_id-based policy added when mechanic dashboard lands.
alter table bookings enable row level security;

-- Anyone can insert a booking (covers guest + logged-in flows)
create policy "Anyone can create a booking" on bookings
  for insert
  with check (true);

-- Logged-in customers see their own bookings by email match
-- (guest bookings have customer_id null but customer_email set)
create policy "Customers can view own bookings" on bookings
  for select
  using (
    auth.uid() = customer_id
    or (customer_id is null and auth.email() = customer_email)
  );

-- Customers can update their own booking (cancel / reschedule — status update only)
create policy "Customers can update own bookings" on bookings
  for update
  using (auth.uid() = customer_id or (customer_id is null and auth.email() = customer_email))
  with check (auth.uid() = customer_id or (customer_id is null and auth.email() = customer_email));

-- Admins see everything
create policy "Admins can view all bookings" on bookings
  for select
  using (public.is_admin());

create policy "Admins can update all bookings" on bookings
  for update
  using (public.is_admin())
  with check (public.is_admin());
