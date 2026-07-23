-- Work types master data (ประเภทงาน)
create table if not exists public.work_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_th text not null,
  name_en text,
  description text,
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

grant select on public.work_types to authenticated;
grant all on public.work_types to service_role;

alter table public.work_types enable row level security;

drop policy if exists work_types_select on public.work_types;
create policy work_types_select on public.work_types for select to authenticated using (true);

drop policy if exists work_types_admin_write on public.work_types;
create policy work_types_admin_write on public.work_types for all to authenticated
  using (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

insert into public.work_types (code, name_th, name_en, sort_order) values
  ('INSTALL', 'ติดตั้งระบบ', 'System Installation', 10),
  ('CONSTRUCT', 'งานก่อสร้าง', 'Construction', 20),
  ('CONSULT', 'ที่ปรึกษา', 'Consulting', 30),
  ('MAINTAIN', 'บำรุงรักษา', 'Maintenance', 40),
  ('SUPPLY', 'จัดหา/จำหน่าย', 'Supply', 50),
  ('SERVICE', 'บริการทั่วไป', 'General Service', 60),
  ('OTHER', 'อื่นๆ', 'Other', 99)
on conflict (code) do nothing;
