-- ---------------------------------------------------------------------------
-- 0075 — Inbox read state (Task 52)
--
-- The Inbox (Notifications) feed is assembled from what the customer can
-- already read: `booking_events` on their bookings and the `reminder_schedules`
-- sent to them. There is no notifications table and this adds none. What it
-- adds is WHERE THEY'VE READ UP TO, so it follows the customer across the
-- website and every phone instead of living in one device's storage.
--
-- The model is the app's existing one (src/lib/inbox.ts), unchanged:
--   • `read_before` — everything at or before this instant is read ("Mark all
--     read");
--   • `read_ids`    — items opened one at a time since, newest first, capped at
--     200. Ids are the feed's own ("event:<uuid>", "reminder:<uuid>").
--   • Anything older than 7 days counts as read regardless (a client rule).
--
-- Writes go through two functions so two devices can't overwrite each other's
-- ids with a read-modify-write: `mark_inbox_item_read(id)` and
-- `mark_inbox_all_read()`. Both run as the caller (SECURITY INVOKER) and only
-- ever touch the caller's own row.
--
-- delete_customer_account() deletes the row (0077).
--
-- ⚠️ SCHEMA CHANGE: the customer app regenerates its types (`npm run db:types`).
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

create table if not exists public.customer_inbox_reads (
  customer_id uuid primary key references public.profiles(id) on delete cascade,
  read_before timestamptz,
  read_ids    text[] not null default '{}',
  updated_at  timestamptz not null default now(),

  constraint customer_inbox_reads_ids_cap check (cardinality(read_ids) <= 200)
);

comment on table public.customer_inbox_reads is
  'Where a customer has read their inbox up to (Task 52). One row per customer; written through mark_inbox_item_read / mark_inbox_all_read.';

alter table public.customer_inbox_reads enable row level security;
revoke all on table public.customer_inbox_reads from anon;

drop policy if exists "Customers read own inbox state" on public.customer_inbox_reads;
create policy "Customers read own inbox state" on public.customer_inbox_reads
  for select using (auth.uid() = customer_id);

drop policy if exists "Customers add own inbox state" on public.customer_inbox_reads;
create policy "Customers add own inbox state" on public.customer_inbox_reads
  for insert with check (auth.uid() = customer_id);

drop policy if exists "Customers update own inbox state" on public.customer_inbox_reads;
create policy "Customers update own inbox state" on public.customer_inbox_reads
  for update using (auth.uid() = customer_id) with check (auth.uid() = customer_id);

-- One item opened. Moves it to the front if it's already there, so the cap
-- drops the oldest.
create or replace function public.mark_inbox_item_read(p_item_id text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to keep track of what you''ve read.' using errcode = '28000';
  end if;
  if p_item_id is null or char_length(p_item_id) not between 1 and 100 then
    raise exception 'That notification id is not valid.' using errcode = '22023';
  end if;

  insert into public.customer_inbox_reads (customer_id, read_ids, updated_at)
  values (auth.uid(), array[p_item_id], now())
  on conflict (customer_id) do update
    set read_ids   = (array[p_item_id] || array_remove(public.customer_inbox_reads.read_ids, p_item_id))[1:200],
        updated_at = now();
end;
$$;

-- "Mark all read": everything up to now, and the individual ids are no longer needed.
create or replace function public.mark_inbox_all_read()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to keep track of what you''ve read.' using errcode = '28000';
  end if;

  insert into public.customer_inbox_reads (customer_id, read_before, read_ids, updated_at)
  values (auth.uid(), now(), '{}', now())
  on conflict (customer_id) do update
    set read_before = now(),
        read_ids    = '{}',
        updated_at  = now();
end;
$$;

revoke all on function public.mark_inbox_item_read(text) from public, anon;
revoke all on function public.mark_inbox_all_read() from public, anon;
grant execute on function public.mark_inbox_item_read(text) to authenticated;
grant execute on function public.mark_inbox_all_read() to authenticated;
