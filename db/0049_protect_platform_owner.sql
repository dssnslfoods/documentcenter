-- 0049: ป้องกันไม่ให้บทบาท platform_owner ถูกถอดโดยผู้ดูแลองค์กร
-- สิทธิ์ผู้ดูแลแพลตฟอร์มต้องถอดไม่ได้ (จัดการได้เฉพาะระดับฐานข้อมูล/platform_owner เท่านั้น)

-- 1) ยกเลิกฟังก์ชันที่เปิดให้ super_admin ถอดสิทธิ์
drop function if exists public.set_platform_owner(uuid, boolean);

-- 2) คืนบทบาทให้บัญชีหลัก (กันกรณีถูกถอดไปแล้ว)
insert into public.user_roles (user_id, role)
select u.id, 'platform_owner'::app_role
from auth.users u
where lower(u.email) = 'contact@d2infinite.com'
on conflict (user_id, role) do nothing;

-- 3) ทริกเกอร์กันการลบ/แก้ไขแถวบทบาท platform_owner
create or replace function public.protect_platform_owner_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'DELETE' and old.role = 'platform_owner')
     or (tg_op = 'UPDATE' and old.role = 'platform_owner' and new.role is distinct from old.role) then
    if not public.has_role(auth.uid(), 'platform_owner') then
      raise exception 'ไม่สามารถถอดสิทธิ์ผู้ดูแลแพลตฟอร์มได้';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists trg_protect_platform_owner on public.user_roles;
create trigger trg_protect_platform_owner
before update or delete on public.user_roles
for each row execute function public.protect_platform_owner_role();
