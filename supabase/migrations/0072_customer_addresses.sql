-- ---------------------------------------------------------------------------
-- 0072 — Saved addresses (Task 49)
--
-- A customer's saved addresses: "Home", "Work", "Mum's". Read and written by
-- the customer directly under RLS, from both clients:
--   • the website: /dashboard/settings/addresses (server actions on the cookie
--     client, so these same policies apply) and the booking flow's address
--     step, which offers them;
--   • the customer app: the Addresses screen (src/lib/addresses.ts), direct.
--
-- Because the app writes straight to the table, the table is its own
-- validation. Lengths, the kind and parking vocabularies and the postcode shape
-- are CHECKs, and a trigger tidies what it safely can (trims, postcode spacing)
-- instead of refusing it. There is no server-side check the app could skip.
--
-- ONE DEFAULT per customer, kept by triggers rather than by the clients:
--   • the first address saved becomes the default;
--   • saving an address as the default clears the old one in the same
--     statement (the partial unique index is the backstop);
--   • deleting the default promotes the most recently updated one left.
-- So "Set as default" is a single update of one row, from either client.
--
-- delete_customer_account() deletes these rows (0077).
--
-- ⚠️ SCHEMA CHANGE: the customer app regenerates its types (`npm run db:types`).
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

-- "ng127gg", "NG12  7GG" → "NG12 7GG". Shared with 0073's callers and anything
-- else that stores a postcode; returns the input uppercased when it can't find
-- an inward code, so the CHECK below is what refuses it.
create or replace function public.normalise_uk_postcode(p text)
returns text
language sql
immutable
as $$
  select case
    when p is null then null
    else regexp_replace(upper(regexp_replace(p, '\s+', '', 'g')), '^(.+)([0-9][A-Z]{2})$', '\1 \2')
  end;
$$;

create table if not exists public.customer_addresses (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          uuid not null references public.profiles(id) on delete cascade,
  -- "Home", "Mum's". Shown as the card title.
  label                text not null,
  -- Picks the card's icon.
  kind                 text not null default 'home',
  -- A short line under the label: "Weekends only", "Southwark office".
  note                 text,
  address_line_1       text not null,
  address_line_2       text,
  postcode             text not null,
  -- The same four values as bookings.parking_type (lib/bookings/address-draft.ts).
  parking_type         text,
  special_instructions text,
  is_default           boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint customer_addresses_label_length check (char_length(label) between 1 and 40),
  constraint customer_addresses_kind check (kind in ('home', 'work', 'other')),
  constraint customer_addresses_note_length check (note is null or char_length(note) <= 80),
  constraint customer_addresses_line_1_length check (char_length(address_line_1) between 1 and 120),
  constraint customer_addresses_line_2_length check (address_line_2 is null or char_length(address_line_2) <= 120),
  constraint customer_addresses_postcode_shape check (postcode ~ '^[A-Z]{1,2}[0-9][A-Z0-9]? [0-9][A-Z]{2}$'),
  constraint customer_addresses_parking_type check (
    parking_type is null or parking_type in ('driveway', 'street', 'car_park', 'other')
  ),
  constraint customer_addresses_instructions_length check (
    special_instructions is null or char_length(special_instructions) <= 500
  )
);

create index if not exists customer_addresses_customer_idx
  on public.customer_addresses (customer_id);

create unique index if not exists customer_addresses_one_default
  on public.customer_addresses (customer_id)
  where is_default;

comment on table public.customer_addresses is
  'A customer''s saved addresses (Task 49). Customer CRUD under RLS from the website and the app; one default per customer, kept by triggers.';

-- ---------------------------------------------------------------------------
-- Tidy, cap and keep one default. SECURITY INVOKER (the default): the count and
-- the "clear the old default" update run under the caller's own RLS, which is
-- exactly their own rows.
-- ---------------------------------------------------------------------------
create or replace function public.customer_addresses_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.label                := btrim(new.label);
  new.note                 := nullif(btrim(new.note), '');
  new.address_line_1       := btrim(new.address_line_1);
  new.address_line_2       := nullif(btrim(new.address_line_2), '');
  new.postcode             := public.normalise_uk_postcode(btrim(new.postcode));
  new.special_instructions := nullif(btrim(new.special_instructions), '');

  if tg_op = 'INSERT' then
    -- A ceiling, not a product limit: the app inserts directly, so nothing
    -- else stops a script filling the table.
    if (select count(*) from public.customer_addresses where customer_id = new.customer_id) >= 20 then
      raise exception 'You can save up to 20 addresses. Remove one to add another.'
        using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.customer_addresses where customer_id = new.customer_id) then
      new.is_default := true;
    end if;
  else
    new.updated_at := now();
  end if;

  if new.is_default and (tg_op = 'INSERT' or not old.is_default) then
    update public.customer_addresses
       set is_default = false
     where customer_id = new.customer_id
       and id <> new.id
       and is_default;
  end if;

  return new;
end;
$$;

drop trigger if exists customer_addresses_before_write on public.customer_addresses;
create trigger customer_addresses_before_write
  before insert or update on public.customer_addresses
  for each row execute function public.customer_addresses_before_write();

create or replace function public.customer_addresses_after_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.is_default then
    update public.customer_addresses
       set is_default = true
     where id = (
       select id
         from public.customer_addresses
        where customer_id = old.customer_id
        order by updated_at desc
        limit 1
     );
  end if;
  return null;
end;
$$;

drop trigger if exists customer_addresses_after_delete on public.customer_addresses;
create trigger customer_addresses_after_delete
  after delete on public.customer_addresses
  for each row execute function public.customer_addresses_after_delete();

-- ---------------------------------------------------------------------------
-- RLS: the customer owns their rows outright; admins can read them.
-- ---------------------------------------------------------------------------
alter table public.customer_addresses enable row level security;
revoke all on table public.customer_addresses from anon;

drop policy if exists "Customers read own addresses" on public.customer_addresses;
create policy "Customers read own addresses" on public.customer_addresses
  for select using (auth.uid() = customer_id);

drop policy if exists "Customers add own addresses" on public.customer_addresses;
create policy "Customers add own addresses" on public.customer_addresses
  for insert with check (auth.uid() = customer_id);

drop policy if exists "Customers update own addresses" on public.customer_addresses;
create policy "Customers update own addresses" on public.customer_addresses
  for update using (auth.uid() = customer_id) with check (auth.uid() = customer_id);

drop policy if exists "Customers delete own addresses" on public.customer_addresses;
create policy "Customers delete own addresses" on public.customer_addresses
  for delete using (auth.uid() = customer_id);

drop policy if exists "Admins read all addresses" on public.customer_addresses;
create policy "Admins read all addresses" on public.customer_addresses
  for select using (public.is_admin());
