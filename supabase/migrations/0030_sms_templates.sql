-- 0030_sms_templates.sql
-- Editable lifecycle SMS templates. The message bodies for booking/job/message
-- notifications used to be hardcoded in the server actions & crons. This table
-- stores admin OVERRIDES only: one row per template key, keyed by the same keys
-- declared in lib/sms/templates.ts. When a key has no row, the sender falls back
-- to the code default — so "reset to default" is just deleting the row, and the
-- canonical copy always lives in code.
--
-- Like sms_settings / sms_credit_purchases (0026), this is a platform-level,
-- service-role-only table: reads and writes happen through the admin client in
-- server actions after an admin check. RLS is enabled with no policies, so the
-- anon/authenticated roles can't touch it.
--
-- Idempotent: safe to re-run.

create table if not exists public.sms_templates (
  key        text primary key,
  body       text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.sms_templates enable row level security;
-- No policies: only the service-role (admin client) may read/write. Admin UI and
-- the send paths both go through it.
