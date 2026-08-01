-- 0044: เปิด/ปิดเมนู (ฟีเจอร์) ให้แต่ละองค์กร — จัดการโดยผู้ดูแลแพลตฟอร์มเท่านั้น
--
-- ลำดับการตรวจสิทธิ์เมนูของผู้ใช้
--   1) องค์กรของผู้ใช้ต้องถูกเปิดเมนูนั้นไว้ (organization_page_access)
--   2) บทบาทของผู้ใช้ต้องได้รับอนุญาต (role_page_access)

create table if not exists public.organization_page_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  page_key text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (organization_id, page_key)
);

create index if not exists opa_org_idx on public.organization_page_access(organization_id);

grant select, insert, update, delete on public.organization_page_access to authenticated;
grant all on public.organization_page_access to service_role;

alter table public.organization_page_access enable row level security;

-- อ่านได้: ผู้ดูแลแพลตฟอร์ม หรือ สมาชิกขององค์กรนั้น
drop policy if exists opa_read on public.organization_page_access;
create policy opa_read on public.organization_page_access
  for select to authenticated
  using (public.is_platform_owner() or organization_id = public.current_org_id());

-- แก้ไขได้: ผู้ดูแลแพลตฟอร์มเท่านั้น
drop policy if exists opa_write on public.organization_page_access;
create policy opa_write on public.organization_page_access
  for all to authenticated
  using (public.is_platform_owner())
  with check (public.is_platform_owner());

drop trigger if exists opa_set_updated_at on public.organization_page_access;
create trigger opa_set_updated_at
  before update on public.organization_page_access
  for each row execute function public.set_updated_at();

-- ค่าเริ่มต้น: เปิดทุกเมนู (ยกเว้นเมนูระดับแพลตฟอร์ม) ให้ทุกองค์กรที่มีอยู่
insert into public.organization_page_access (organization_id, page_key, enabled)
select o.id, k, true
from public.organizations o
cross join unnest(array[
  'dashboard','calendar','notifications','projects','quotations','partners',
  'documents','contracts','reports','audit-log','settings'
]) as k
on conflict (organization_id, page_key) do nothing;
