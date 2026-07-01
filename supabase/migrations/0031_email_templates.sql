-- 0031_email_templates.sql
-- Editable email templates (copy-block model). Mirrors sms_templates (0030):
-- stores admin OVERRIDES only. The canonical subject + block copy live in code
-- (emails/registry.ts); a row here overrides the subject and/or individual
-- block texts by id. Missing row / missing field → code default.
--
--   subject  — override subject line (null = use code default)
--   blocks   — jsonb map of { [blockId]: overriddenText } for editable blocks
--
-- Platform-level, service-role-only (like sms_settings / sms_templates): reads
-- and writes go through the admin client after an admin check. RLS enabled with
-- no policies, so anon/authenticated can't touch it.
--
-- Idempotent: safe to re-run.

create table if not exists public.email_templates (
  key        text primary key,
  subject    text,
  blocks     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.email_templates enable row level security;
-- No policies: only the service-role (admin client) may read/write.
