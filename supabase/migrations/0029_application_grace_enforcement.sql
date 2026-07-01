-- 0029_application_grace_enforcement.sql
-- Task 07 follow-up — documents & references are no longer mandatory to *submit*
-- a mechanic application. Applicants can apply without their paperwork to hand;
-- an admin approves "with 28-day grace" and the mechanic goes live with a
-- deadline to supply the outstanding docs.
--
-- This migration adds the two columns the enforcement cron
-- (/api/cron/enforce-grace-periods) needs:
--   • approved_mechanic_id — the profile/mechanic id provisioned on approval, so
--     the cron can resolve an application back to its live mechanic without an
--     email lookup (profiles carries no email column).
--   • grace_enforced_at — stamped once the cron has resolved OR suspended a grace
--     application, so it is processed exactly once past its deadline.
--
-- The doc_* and reference_* columns were already nullable (see 0013), so no
-- column relaxation is needed — only the client/server validation changes.
--
-- Idempotent: safe to re-run.

alter table public.mechanic_applications
  add column if not exists approved_mechanic_id uuid references public.profiles(id);

alter table public.mechanic_applications
  add column if not exists grace_enforced_at timestamptz;

-- Cron scans active grace approvals; index the states it filters on.
create index if not exists mechanic_applications_grace_idx
  on public.mechanic_applications (status, grace_period_ends_at)
  where status = 'approved_with_grace' and grace_enforced_at is null;
