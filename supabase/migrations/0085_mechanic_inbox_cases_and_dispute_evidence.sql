-- ---------------------------------------------------------------------------
-- 0085 — The mechanic app's Inbox: read state, the Resolution Center's tables
--        and evidence, and photos + private BMT notes in a dispute thread
--        (Task 69)
--
-- 1. THE RESOLUTION CENTER'S TABLES — `resolution_reasons`, `resolution_cases`,
--    `resolution_messages` (Task 14, migration 0032). 0032 appears never to
--    have been applied to production: the three tables are absent from the
--    generated types (2026-09-17). They are created HERE, word for word as
--    0032 defines them, so this file stands alone whichever is true — every
--    statement is `if not exists` / `drop … if exists`, so on a database that
--    does have them this section changes nothing but the one policy below.
--
--    ⚠️ DO NOT RUN 0032 ITSELF NOW. Its last section rewrites the
--    `booking_events` event-type CHECK to the list as it stood in July, which
--    lacks `arrival_window_set`, `fault_added`, the `quote_*` and the
--    `revision_*` types added since (0052, 0062, 0064). Against today's rows it
--    fails; on an empty table it would silently forbid them. The
--    `resolution_opened` / `resolution_redistributed` types it was there to
--    add are already in the live CHECK — 0052, 0062 and 0064 each carried them
--    forward — so that section is not needed and is not repeated here.
--
--    One change from 0032: who may read the reason list. 0032 keyed it on
--    `profiles.role in ('admin','mechanic')`, the only mechanic gate in the
--    schema that does. Everywhere else "is a mechanic" means HAS A `mechanics`
--    ROW (owner decision 2026-07-20) — an admin who also works jobs keeps
--    role 'admin'. Now: has a mechanics row, or is an admin.
--
-- 2. `resolution_cases.photos` — evidence on a case, up to 6 public URLs from
--    the `job-media` bucket under `cases/<uploader>/…`. The server validates
--    the prefix; the cap is a CHECK.
--
-- 3. `dispute_messages.photos` — up to 6 photos on a thread message, so a
--    mechanic can answer a dispute with evidence.
--
-- 4. `dispute_messages.visible_to` — a PRIVATE note from Book My Tech to one
--    party. null = everyone (every existing row). 'mechanic' / 'customer' =
--    only that party, and admins. Enforced in the "Parties read dispute
--    thread" policy, not the UI: the other party's own client — the customer
--    app reads this table directly — simply never receives the row. Only an
--    admin can write one; like every write to this table it goes through the
--    service role (lib/disputes/core.ts).
--
-- 5. `mechanic_inbox_reads` — where a mechanic has read their Inbox up to. A
--    mirror of `customer_inbox_reads` (0075): same model, same cap, same two
--    functions so two devices can't overwrite each other. Separate table
--    because the ids are a different feed's, and one person can be both.
--
-- ⚠️ SCHEMA CHANGE: both apps regenerate their types (`npm run db:types`).
--    New for the customer app: `dispute_messages.photos` and `.visible_to`
--    (both additive; its direct read keeps working and now never returns a
--    note meant for the mechanic).
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

-- 1. Resolution Center tables (as 0032) ------------------------------------

create table if not exists public.resolution_reasons (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resolution_reasons_active_idx
  on public.resolution_reasons (active, sort_order);

alter table public.resolution_reasons enable row level security;

drop policy if exists "Staff read resolution reasons" on public.resolution_reasons;
create policy "Staff read resolution reasons" on public.resolution_reasons
  for select using (
    public.is_admin()
    or exists (select 1 from public.mechanics m where m.id = auth.uid())
  );

create unique index if not exists resolution_reasons_label_key
  on public.resolution_reasons (label);

insert into public.resolution_reasons (label, sort_order) values
  ('Can''t complete this job',            10),
  ('Customer unreachable',                20),
  ('Vehicle/access issue on arrival',     30),
  ('Scope larger than booked',            40),
  ('Parts unavailable',                   50),
  ('Safety concern',                      60),
  ('Other',                               99)
on conflict (label) do nothing;

create table if not exists public.resolution_cases (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references public.bookings(id) on delete cascade,
  mechanic_id    uuid not null references public.profiles(id),
  opened_by      uuid references public.profiles(id),
  opened_by_role text not null check (opened_by_role in ('mechanic', 'admin')),
  reason_id      uuid references public.resolution_reasons(id),
  reason_label   text not null,
  description    text not null,
  status         text not null default 'open'
                   check (status in ('open', 'in_progress', 'resolved', 'closed')),
  redistributed  boolean not null default false,
  resolution_note text,
  resolved_by    uuid references public.profiles(id),
  resolved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists resolution_cases_status_idx
  on public.resolution_cases (status, created_at desc);
create index if not exists resolution_cases_mechanic_idx
  on public.resolution_cases (mechanic_id, created_at desc);
create index if not exists resolution_cases_booking_idx
  on public.resolution_cases (booking_id);

alter table public.resolution_cases enable row level security;

drop policy if exists "Mechanics read own resolution cases" on public.resolution_cases;
create policy "Mechanics read own resolution cases" on public.resolution_cases
  for select using (mechanic_id = auth.uid() or opened_by = auth.uid());

drop policy if exists "Admins read all resolution cases" on public.resolution_cases;
create policy "Admins read all resolution cases" on public.resolution_cases
  for select using (public.is_admin());

create table if not exists public.resolution_messages (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.resolution_cases(id) on delete cascade,
  sender_id   uuid references public.profiles(id),
  sender_role text not null check (sender_role in ('mechanic', 'admin')),
  body        text not null check (length(btrim(body)) > 0),
  created_at  timestamptz not null default now()
);

create index if not exists resolution_messages_case_idx
  on public.resolution_messages (case_id, created_at);

alter table public.resolution_messages enable row level security;

drop policy if exists "Case mechanic reads thread" on public.resolution_messages;
create policy "Case mechanic reads thread" on public.resolution_messages
  for select using (
    exists (
      select 1 from public.resolution_cases c
       where c.id = resolution_messages.case_id
         and (c.mechanic_id = auth.uid() or c.opened_by = auth.uid())
    )
  );

drop policy if exists "Admins read resolution threads" on public.resolution_messages;
create policy "Admins read resolution threads" on public.resolution_messages
  for select using (public.is_admin());

-- 2. Evidence on a case -----------------------------------------------------

alter table public.resolution_cases
  add column if not exists photos text[] not null default '{}';

alter table public.resolution_cases drop constraint if exists resolution_cases_photos_cap;
alter table public.resolution_cases
  add constraint resolution_cases_photos_cap check (cardinality(photos) <= 6);

comment on column public.resolution_cases.photos is
  '0085: evidence attached when the case was raised — up to 6 public job-media URLs under cases/<uploader>/.';

-- 3 + 4. Dispute thread: photos, and notes for one party only ---------------

alter table public.dispute_messages
  add column if not exists photos text[] not null default '{}',
  add column if not exists visible_to text;

alter table public.dispute_messages drop constraint if exists dispute_messages_photos_cap;
alter table public.dispute_messages
  add constraint dispute_messages_photos_cap check (cardinality(photos) <= 6);

alter table public.dispute_messages drop constraint if exists dispute_messages_visible_to_check;
alter table public.dispute_messages
  add constraint dispute_messages_visible_to_check
  check (visible_to in ('mechanic', 'customer'));

-- A note for one party is Book My Tech's to write, nobody else's.
alter table public.dispute_messages drop constraint if exists dispute_messages_private_is_admin;
alter table public.dispute_messages
  add constraint dispute_messages_private_is_admin
  check (visible_to is null or sender_role = 'admin');

comment on column public.dispute_messages.photos is
  '0085: up to 6 public job-media URLs (disputes/<uploader>/…) sent with the message.';
comment on column public.dispute_messages.visible_to is
  '0085: null = every party. ''mechanic'' / ''customer'' = a private note from Book My Tech that only that party (and admins) can read — enforced by the "Parties read dispute thread" policy.';

-- The same party test as 0025, with each arm now also asking whether the row
-- is meant for that party. "Admins read dispute threads" is untouched: an
-- admin reads everything.
drop policy if exists "Parties read dispute thread" on public.dispute_messages;
create policy "Parties read dispute thread" on public.dispute_messages
  for select using (
    exists (
      select 1
        from public.disputes d
        join public.bookings b on b.id = d.booking_id
       where d.id = dispute_messages.dispute_id
         and (
           (
             coalesce(dispute_messages.visible_to, 'customer') = 'customer'
             and (
               b.customer_id = auth.uid()
               or (b.customer_id is null and b.customer_email = auth.email())
             )
           )
           or (
             coalesce(dispute_messages.visible_to, 'mechanic') = 'mechanic'
             and b.mechanic_id = auth.uid()
           )
         )
    )
  );

-- 5. Mechanic inbox read state (mirror of 0075) -----------------------------

create table if not exists public.mechanic_inbox_reads (
  mechanic_id uuid primary key references public.mechanics(id) on delete cascade,
  read_before timestamptz,
  read_ids    text[] not null default '{}',
  updated_at  timestamptz not null default now(),

  constraint mechanic_inbox_reads_ids_cap check (cardinality(read_ids) <= 200)
);

comment on table public.mechanic_inbox_reads is
  '0085: where a mechanic has read their Inbox up to (Task 69). One row per mechanic; written through mark_mechanic_inbox_item_read / mark_mechanic_inbox_all_read. Message threads are not tracked here — their unread state is messages.read_at.';

alter table public.mechanic_inbox_reads enable row level security;
revoke all on table public.mechanic_inbox_reads from anon;

drop policy if exists "Mechanics read own inbox state" on public.mechanic_inbox_reads;
create policy "Mechanics read own inbox state" on public.mechanic_inbox_reads
  for select using (auth.uid() = mechanic_id);

drop policy if exists "Mechanics add own inbox state" on public.mechanic_inbox_reads;
create policy "Mechanics add own inbox state" on public.mechanic_inbox_reads
  for insert with check (auth.uid() = mechanic_id);

drop policy if exists "Mechanics update own inbox state" on public.mechanic_inbox_reads;
create policy "Mechanics update own inbox state" on public.mechanic_inbox_reads
  for update using (auth.uid() = mechanic_id) with check (auth.uid() = mechanic_id);

create or replace function public.mark_mechanic_inbox_item_read(p_item_id text)
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

  insert into public.mechanic_inbox_reads (mechanic_id, read_ids, updated_at)
  values (auth.uid(), array[p_item_id], now())
  on conflict (mechanic_id) do update
    set read_ids   = (array[p_item_id] || array_remove(mechanic_inbox_reads.read_ids, p_item_id))[1:200],
        updated_at = now();
end;
$$;

create or replace function public.mark_mechanic_inbox_all_read()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to keep track of what you''ve read.' using errcode = '28000';
  end if;

  insert into public.mechanic_inbox_reads (mechanic_id, read_before, read_ids, updated_at)
  values (auth.uid(), now(), '{}', now())
  on conflict (mechanic_id) do update
    set read_before = now(),
        read_ids    = '{}',
        updated_at  = now();
end;
$$;

revoke all on function public.mark_mechanic_inbox_item_read(text) from public, anon;
revoke all on function public.mark_mechanic_inbox_all_read() from public, anon;
grant execute on function public.mark_mechanic_inbox_item_read(text) to authenticated;
grant execute on function public.mark_mechanic_inbox_all_read() to authenticated;
