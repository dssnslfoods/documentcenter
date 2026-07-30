-- 0023: Role-based page/menu access controlled from Settings
-- Run this in the Supabase SQL editor.

create table if not exists public.role_page_access (
  id uuid primary key default gen_random_uuid(),
  role public.app_role not null,
  page_key text not null,
  allowed boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (role, page_key)
);

create index if not exists rpa_role_idx on public.role_page_access(role);

grant select on public.role_page_access to authenticated;
grant all on public.role_page_access to service_role;

alter table public.role_page_access enable row level security;

drop policy if exists "rpa_read" on public.role_page_access;
create policy "rpa_read" on public.role_page_access
  for select to authenticated using (true);

drop policy if exists "rpa_admin_all" on public.role_page_access;
create policy "rpa_admin_all" on public.role_page_access
  for all to authenticated
  using (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

grant insert, update, delete on public.role_page_access to authenticated;

-- Seed defaults (documents/contracts = manager level and above)
insert into public.role_page_access (role, page_key, allowed) values
  ('super_admin','dashboard',true),('super_admin','calendar',true),('super_admin','notifications',true),
  ('super_admin','projects',true),('super_admin','quotations',true),('super_admin','partners',true),
  ('super_admin','documents',true),('super_admin','contracts',true),('super_admin','reports',true),
  ('super_admin','audit-log',true),('super_admin','settings',true),

  ('management','dashboard',true),('management','calendar',true),('management','notifications',true),
  ('management','projects',true),('management','quotations',true),('management','partners',true),
  ('management','documents',true),('management','contracts',true),('management','reports',true),
  ('management','audit-log',true),('management','settings',false),

  ('dept_manager','dashboard',true),('dept_manager','calendar',true),('dept_manager','notifications',true),
  ('dept_manager','projects',true),('dept_manager','quotations',true),('dept_manager','partners',true),
  ('dept_manager','documents',true),('dept_manager','contracts',true),('dept_manager','reports',true),
  ('dept_manager','audit-log',false),('dept_manager','settings',false),

  ('staff','dashboard',true),('staff','calendar',true),('staff','notifications',true),
  ('staff','projects',true),('staff','quotations',true),('staff','partners',true),
  ('staff','documents',false),('staff','contracts',false),('staff','reports',true),
  ('staff','audit-log',false),('staff','settings',false),

  ('viewer','dashboard',true),('viewer','calendar',true),('viewer','notifications',true),
  ('viewer','projects',true),('viewer','quotations',false),('viewer','partners',false),
  ('viewer','documents',false),('viewer','contracts',false),('viewer','reports',false),
  ('viewer','audit-log',false),('viewer','settings',false)
on conflict (role, page_key) do nothing;
