-- 0014_application_verification.sql
-- Task 07 Stage 2 — admin approvals queue.
--
-- Adds a `verification` jsonb map on mechanic_applications so the admin's
-- manual "mark verified" toggles on each checklist item persist across reloads.
-- Shape: { "doc_photo_id": true, "bank": true, ... } — a key set true means an
-- admin has manually verified that item, overriding the auto-screen verdict.
--
-- Idempotent: safe to re-run.

alter table public.mechanic_applications
  add column if not exists verification jsonb not null default '{}'::jsonb;
