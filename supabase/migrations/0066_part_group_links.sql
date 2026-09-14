-- 0066_part_group_links.sql
-- Task 45 — link HaynesPro repairs to supplier parts. Stage 1: which LKQ
-- component each TecDoc part group means.
--
-- ⚠️ SCHEMA CHANGE — the mobile app generates its TypeScript types from the
-- live schema, so `npm run db:types` must be re-run there after this applies.
-- Nothing customer-facing: the table is admin-only (no customer or mechanic
-- policy), and no existing table changes.
--
-- Why a table. HaynesPro names, per repair, the TecDoc part groups it uses
-- ("GenArts": 82 brake disc, 402 brake pads). Alliance Automotive prices by
-- those ids directly. LKQ does not: it has its own 2,277 component numbers,
-- and no API of theirs maps one to the other (TecDocReferences, tested
-- 2026-09-14: no part-group field anywhere in its schema, and a generic 400).
-- So the mapping is a human decision, made ONCE per part group — a GenArt
-- means the same thing on every vehicle — and stored here.
--
-- Rows are added automatically, unreviewed, as HaynesPro repairs are fetched
-- (lib/parts/part-groups.ts). A suggested match by name is computed at read
-- time (lib/parts/part-group-match.ts) and never stored, so improving the
-- matcher improves every unreviewed row at once. Only an admin decision is
-- stored: `confirmed` with a component, or `no_match`.
--
-- Idempotent: safe to re-run.

create table if not exists public.part_group_links (
  genart_id     integer primary key check (genart_id > 0),
  -- HaynesPro's (TecDoc's) name for the group, as first seen.
  description   text not null default '',
  -- One repair that uses it, for context on the review page.
  sample_repair text,
  status        text not null default 'unreviewed'
                check (status in ('unreviewed', 'confirmed', 'no_match')),
  -- LKQ ADS component number. An opaque string: "000027", "con997".
  lkq_component text,
  reviewed_by   uuid references public.profiles(id),
  reviewed_at   timestamptz,
  first_seen_at timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint part_group_links_component_matches_status check (
    (status = 'confirmed' and lkq_component is not null)
    or (status <> 'confirmed' and lkq_component is null)
  )
);

create index if not exists part_group_links_status_idx
  on public.part_group_links (status);

alter table public.part_group_links enable row level security;

-- Written only by admin server actions through the service-role client; the
-- SELECT policy exists for parity with the repair catalogue tables (0056).
drop policy if exists "Admins read part group links" on public.part_group_links;
create policy "Admins read part group links" on public.part_group_links
  for select using (public.is_admin());

-- The six pairings verified by hand in Task 42 (lib/lkq/mapping.ts). The two
-- that were only ever "assumed" (wishbone 273, clutch 479) are left for review.
insert into public.part_group_links (genart_id, description, status, lkq_component, reviewed_at) values
  (82,   'Brake disc',  'confirmed', '000027', now()),
  (402,  'Brake pads',  'confirmed', '000036', now()),
  (8,    'Air filter',  'confirmed', '000008', now()),
  (3357, 'Brake fluid', 'confirmed', '000989', now()),
  (1,    'Battery',     'confirmed', '000020', now()),
  (307,  'Timing belt', 'confirmed', '000336', now())
on conflict (genart_id) do nothing;

comment on table public.part_group_links is
  'TecDoc part group (HaynesPro GenArt) → LKQ component, decided once by an admin (Task 45). Unreviewed rows are added as repairs are fetched; suggestions are computed, never stored.';
