-- =====================================================================
-- Backfill public.profiles from auth.users
--
-- Why: db/0012_clear_mockup_data.sql truncates `departments` with CASCADE,
-- which also truncates `profiles` (it references departments). Existing
-- accounts (including the admin) therefore lost their profile row, so the
-- team list showed a raw user id and Settings > Users listed only newer users.
--
-- Safe to run multiple times.
-- =====================================================================

insert into public.profiles (id, email, full_name, is_active)
select
  u.id,
  coalesce(u.email, u.id::text),
  coalesce(u.raw_user_meta_data->>'full_name', split_part(coalesce(u.email,''), '@', 1), u.email),
  true
from auth.users u
on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name);

-- Make sure everyone has at least a base role
insert into public.user_roles (user_id, role)
select u.id, 'staff'::public.app_role
from auth.users u
where not exists (select 1 from public.user_roles r where r.user_id = u.id)
on conflict do nothing;
