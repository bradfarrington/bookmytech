-- 0053_notification_toggles.sql
-- Task 22 — admin on/off switches for each SMS and email template.
--
-- One row per (channel, key) the admin has explicitly toggled. A key with no
-- row is ENABLED. Rows are written by `setSmsTemplateEnabled` /
-- `setEmailTemplateEnabled` (app/actions/sms.ts, app/actions/email-templates.ts)
-- and read by lib/notifications/toggles.ts, which gates `renderTemplateEmail`
-- and `getSmsTemplateBody` — so a switched-off template never renders, never
-- sends, and never spends an SMS credit.
--
-- This is deliberately NOT a column on `sms_templates` / `email_templates`.
-- Those are overrides-only tables where "Reset to default" is a DELETE, so an
-- `enabled` flag there would be wiped by a reset and would force a row to exist
-- for every template still on its default copy.
--
-- ⚠️ SCHEMA CHANGE — the mobile app generates its TypeScript types from the
-- live schema, so `npm run db:types` should be re-run there after this applies.
-- The table is service-role only (no policies), so the app cannot read it and
-- nothing in the app changes.
--
-- Idempotent: safe to re-run.

create table if not exists public.notification_toggles (
  channel    text not null check (channel in ('sms', 'email')),
  key        text not null,
  enabled    boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  primary key (channel, key)
);

alter table public.notification_toggles enable row level security;
-- No policies: only the service-role (admin client) may read/write.
