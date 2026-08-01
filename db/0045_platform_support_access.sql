-- 0045: โหมดสนับสนุน (Support Access)
-- ผู้ดูแลแพลตฟอร์มจะเข้าใช้งานภายในองค์กรด้วย "สิทธิ์เต็ม" ได้
-- ก็ต่อเมื่อผู้ดูแลองค์กร (super_admin) ขององค์กรนั้นเปิดสิทธิ์ให้เท่านั้น
-- และสามารถกำหนดวันหมดอายุได้ (ถ้าไม่กำหนด = เปิดจนกว่าจะปิดเอง)

create table if not exists public.organization_support_access (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default false,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz,
  expires_at timestamptz,
  note text,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.organization_support_access to authenticated;
grant all on public.organization_support_access to service_role;

alter table public.organization_support_access enable row level security;

-- ผู้ดูแลแพลตฟอร์มอ่านได้ทุกองค์กร / ผู้ใช้ในองค์กรอ่านขององค์กรตัวเองได้
drop policy if exists support_access_select on public.organization_support_access;
create policy support_access_select on public.organization_support_access
  for select to authenticated
  using (public.is_platform_owner() or organization_id = public.user_org(auth.uid()));

-- เปิด/ปิดได้เฉพาะ super_admin ขององค์กรนั้น (platform owner เปิดให้ตัวเองไม่ได้)
drop policy if exists support_access_insert on public.organization_support_access;
create policy support_access_insert on public.organization_support_access
  for insert to authenticated
  with check (
    public.has_role(auth.uid(), 'super_admin')
    and organization_id = public.user_org(auth.uid())
  );

drop policy if exists support_access_update on public.organization_support_access;
create policy support_access_update on public.organization_support_access
  for update to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin')
    and organization_id = public.user_org(auth.uid())
  )
  with check (
    public.has_role(auth.uid(), 'super_admin')
    and organization_id = public.user_org(auth.uid())
  );

drop policy if exists support_access_delete on public.organization_support_access;
create policy support_access_delete on public.organization_support_access
  for delete to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin')
    and organization_id = public.user_org(auth.uid())
  );

-- ตารางนี้ไม่ใช้ org_isolation แบบอัตโนมัติ (ไม่มีคอลัมน์ organization_id ที่ชื่อเดียวกันในสคีมา loop)
-- จึงคุมด้วย policy ด้านบนโดยตรง

-- ---------------------------------------------------------------- helper
-- true เมื่อองค์กรนั้นเปิดโหมดสนับสนุนอยู่ (และยังไม่หมดอายุ)
create or replace function public.support_access_active(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_support_access s
    where s.organization_id = _org
      and s.enabled
      and (s.expires_at is null or s.expires_at > now())
  )
$$;

grant execute on function public.support_access_active(uuid) to authenticated;

-- ผู้ดูแลแพลตฟอร์มสลับเข้าองค์กรได้เฉพาะองค์กรที่เปิดโหมดสนับสนุนไว้
create or replace function public.switch_organization(_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then
    raise exception 'เฉพาะผู้ดูแลแพลตฟอร์มเท่านั้นที่สลับองค์กรได้';
  end if;

  if _org is not null and not public.support_access_active(_org) then
    raise exception 'องค์กรนี้ยังไม่ได้เปิดโหมดสนับสนุน กรุณาให้ผู้ดูแลองค์กรเปิดสิทธิ์ก่อน';
  end if;

  update public.profiles set active_organization_id = _org where id = auth.uid();
end $$;

grant execute on function public.switch_organization(uuid) to authenticated;

-- สร้างแถวเริ่มต้น (ปิดไว้) ให้ทุกองค์กรที่มีอยู่
insert into public.organization_support_access (organization_id, enabled)
select id, false from public.organizations
on conflict (organization_id) do nothing;
