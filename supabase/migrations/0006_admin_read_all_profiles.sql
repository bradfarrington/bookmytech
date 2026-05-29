-- Task 04 Step 3 follow-up — let admins read every profile row.
--
-- The mechanics admin list joins profiles (`mechanics ... profiles!inner`) to
-- show each mechanic's name. Admins could see the `mechanics` rows (via
-- "Admins can view all mechanics") but NOT the matching `profiles` rows, so the
-- inner join silently dropped every mechanic from the list.
--
-- This is the policy that was dropped in Task 02 Stage 1 because its original
-- form — `EXISTS (SELECT 1 FROM profiles ...)` inline — recursed on profiles.
-- Reintroduced here the safe way, via public.is_admin(), which is SECURITY
-- DEFINER and so reads profiles with RLS bypassed inside the function: no
-- recursion. (See docs/02-data-model.md, "RLS patterns to follow", pattern #1.)
--
-- Idempotent: safe to re-run.

-- Ensure the helper exists (SECURITY DEFINER, STABLE). Redeclared so a
-- fresh-environment run of this migration stands on its own.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

drop policy if exists "Admins can view all profiles" on profiles;
create policy "Admins can view all profiles" on profiles
  for select using (public.is_admin());
