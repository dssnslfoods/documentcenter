-- 0041: Multi-tenancy — รองรับการใช้งานหลายองค์กร (Multi-Organization)
--
-- โครงสร้าง
--   platform_owner  = ผู้ดูแลระบบของแพลตฟอร์ม (เห็นทุกองค์กร / สลับองค์กรได้ / สร้าง-ปิดองค์กร)
--   super_admin     = ผู้ดูแลระดับองค์กร (จัดการผู้ใช้ + master data เฉพาะองค์กรตนเอง)
--   บทบาทอื่น ๆ     = สังกัดองค์กรเดียวตาม profiles.organization_id
--
-- การแยกข้อมูลใช้ RESTRICTIVE RLS policy จึงไม่กระทบ policy เดิมที่มีอยู่

-- ---------------------------------------------------------------- organizations
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  name_en text,
  tax_id text,
  address text,
  phone text,
  email text,
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.organizations to authenticated;
grant all on public.organizations to service_role;

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- องค์กรเริ่มต้น (ย้ายข้อมูลเดิมทั้งหมดเข้าองค์กรนี้)
insert into public.organizations (code, name)
values ('ORG001', 'องค์กรหลัก')
on conflict (code) do nothing;

-- ---------------------------------------------------------------- profiles
alter table public.profiles add column if not exists organization_id uuid references public.organizations(id) on delete set null;
-- ใช้เฉพาะ platform_owner: องค์กรที่กำลังสลับเข้าไปดู (null = เห็นทุกองค์กร)
alter table public.profiles add column if not exists active_organization_id uuid references public.organizations(id) on delete set null;
create index if not exists idx_profiles_org on public.profiles(organization_id);

update public.profiles
   set organization_id = (select id from public.organizations where code = 'ORG001')
 where organization_id is null;

-- ---------------------------------------------------------------- helper functions
create or replace function public.is_platform_owner(_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _uid and role = 'platform_owner');
$$;

create or replace function public.current_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(p.active_organization_id, p.organization_id)
  from public.profiles p where p.id = auth.uid();
$$;

-- true เมื่อผู้ใช้ปัจจุบันมองเห็นข้อมูลขององค์กร _org ได้
create or replace function public.org_visible(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _org is null
      or _org = public.current_org_id()
      or (
        public.is_platform_owner()
        and (select p.active_organization_id from public.profiles p where p.id = auth.uid()) is null
      );
$$;

create or replace function public.user_org(_uid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from public.profiles where id = _uid;
$$;

grant execute on function public.is_platform_owner(uuid) to authenticated;
grant execute on function public.current_org_id() to authenticated;
grant execute on function public.org_visible(uuid) to authenticated;
grant execute on function public.user_org(uuid) to authenticated;

-- platform_owner มีสิทธิ์เทียบเท่าทุกบทบาท
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and (role = _role or role = 'platform_owner')
  );
$$;

-- เติม organization_id อัตโนมัติตอน insert
create or replace function public.set_org_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.organization_id is null then
    new.organization_id := public.current_org_id();
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- tenant tables
do $$
declare
  t text;
  default_org uuid := (select id from public.organizations where code = 'ORG001');
  tables text[] := array[
    'departments','document_categories','tags','work_types','vat_rates',
    'partners','projects','documents','contracts','quotations','permission_templates'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then continue; end if;

    execute format(
      'alter table public.%I add column if not exists organization_id uuid references public.organizations(id) on delete cascade', t);
    execute format('update public.%I set organization_id = %L where organization_id is null', t, default_org);
    execute format('create index if not exists idx_%s_org on public.%I(organization_id)', t, t);

    execute format('drop trigger if exists %I on public.%I', t || '_set_org_id', t);
    execute format(
      'create trigger %I before insert on public.%I for each row execute function public.set_org_id()',
      t || '_set_org_id', t);

    execute format('drop policy if exists org_isolation on public.%I', t);
    execute format(
      'create policy org_isolation on public.%I as restrictive to authenticated
         using (public.org_visible(organization_id))
         with check (public.org_visible(organization_id))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- profiles / user_roles isolation
drop trigger if exists profiles_set_org_id on public.profiles;
create trigger profiles_set_org_id before insert on public.profiles
  for each row execute function public.set_org_id();

drop policy if exists org_isolation on public.profiles;
create policy org_isolation on public.profiles as restrictive to authenticated
  using (id = auth.uid() or public.org_visible(organization_id))
  with check (id = auth.uid() or public.org_visible(organization_id));

drop policy if exists org_isolation on public.user_roles;
create policy org_isolation on public.user_roles as restrictive to authenticated
  using (user_id = auth.uid() or public.org_visible(public.user_org(user_id)))
  with check (user_id = auth.uid() or public.org_visible(public.user_org(user_id)));

-- ---------------------------------------------------------------- organizations RLS
alter table public.organizations enable row level security;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select to authenticated
  using (public.is_platform_owner() or id = public.current_org_id());

drop policy if exists organizations_insert on public.organizations;
create policy organizations_insert on public.organizations for insert to authenticated
  with check (public.is_platform_owner());

drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations for update to authenticated
  using (public.is_platform_owner()) with check (public.is_platform_owner());

drop policy if exists organizations_delete on public.organizations;
create policy organizations_delete on public.organizations for delete to authenticated
  using (public.is_platform_owner());

-- ---------------------------------------------------------------- new users inherit org from signup metadata
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _org uuid;
begin
  begin
    _org := nullif(new.raw_user_meta_data->>'organization_id', '')::uuid;
  exception when others then
    _org := null;
  end;

  if _org is null then
    _org := (select id from public.organizations where code = 'ORG001');
  end if;

  insert into public.profiles (id, email, full_name, organization_id)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), _org)
  on conflict (id) do update set organization_id = coalesce(public.profiles.organization_id, excluded.organization_id);

  insert into public.user_roles (user_id, role)
  values (new.id, 'staff')
  on conflict do nothing;

  return new;
end $$;

-- ---------------------------------------------------------------- สลับองค์กร (เฉพาะ platform_owner)
create or replace function public.switch_organization(_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then
    raise exception 'เฉพาะผู้ดูแลแพลตฟอร์มเท่านั้นที่สลับองค์กรได้';
  end if;
  update public.profiles set active_organization_id = _org where id = auth.uid();
end $$;

grant execute on function public.switch_organization(uuid) to authenticated;
