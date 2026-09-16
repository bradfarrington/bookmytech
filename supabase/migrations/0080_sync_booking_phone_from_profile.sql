-- Keep bookings.customer_phone in step with the customer's profile phone.
--
-- The booking column is a snapshot taken at booking time. For a signed-in
-- customer it was only ever a copy of profiles.phone anyway
-- (lib/bookings/create-booking.ts resolves the profile phone ahead of the
-- funnel's optional input), so the two drifting apart has no upside: it just
-- means a customer who corrects their number carries on getting texts —
-- booking updates, mechanic messages, reminders — at the old one, with nothing
-- in the UI to say why.
--
-- This is a TRIGGER rather than a change to updateCustomerProfile because the
-- customer mobile app writes profiles.phone straight through PostgREST under
-- the "Users can update own profile" policy (0010), never touching the server
-- action. A fix in the action would miss the app completely, and old builds
-- already on people's phones could never be made to use it.
--
-- Scope: OPEN bookings only. A completed or cancelled job keeps the number it
-- was actually run with, because its texts are already sent and the row is
-- effectively a record of what happened.

create or replace function public.sync_booking_phone_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- `is distinct from` so a null on either side is handled, and so this is a
  -- no-op for the many profile updates that don't touch the phone.
  if new.phone is distinct from old.phone then
    update public.bookings
       set customer_phone = new.phone
     where customer_id = new.id
       and status not in ('completed', 'cancelled');
  end if;
  return new;
end;
$$;

-- security definer: the customer holds no UPDATE grant on bookings, so the
-- trigger has to run as owner. search_path is pinned above.
revoke all on function public.sync_booking_phone_from_profile() from public;

drop trigger if exists profiles_sync_booking_phone on public.profiles;
create trigger profiles_sync_booking_phone
  after update of phone on public.profiles
  for each row
  execute function public.sync_booking_phone_from_profile();

-- One-off backfill for bookings that already drifted.
--
-- Deliberately skips profiles with a null phone: nulling a live booking's
-- number as a side effect of a migration would silently switch off that
-- customer's texts, which is a worse surprise than leaving a stale number for
-- someone to correct. Going forward the trigger DOES propagate a cleared
-- number, because by then it is a deliberate act by the customer.
update public.bookings b
   set customer_phone = p.phone
  from public.profiles p
 where b.customer_id = p.id
   and p.phone is not null
   and b.customer_phone is distinct from p.phone
   and b.status not in ('completed', 'cancelled');
