-- 0048: คืนบทบาท platform_owner ให้บัญชีผู้ดูแลแพลตฟอร์ม และเปิดทางให้ super_admin
-- มอบ/ถอดบทบาท platform_owner ได้เองจากหน้า "ผู้ใช้งานและสิทธิ์"

-- 1) คืนบทบาทให้บัญชีหลัก
insert into public.user_roles (user_id, role)
select u.id, 'platform_owner'::app_role
from auth.users u
where lower(u.email) = 'contact@d2infinite.com'
on conflict (user_id, role) do nothing;

-- 2) เคลียร์องค์กรที่กำลังสลับเข้าอยู่ เพื่อให้เริ่มที่โหมดผู้ดูแลแพลตฟอร์ม
update public.profiles p
   set active_organization_id = null
  from auth.users u
 where p.id = u.id and lower(u.email) = 'contact@d2infinite.com';

-- 3) ฟังก์ชันให้ super_admin มอบ/ถอดบทบาท platform_owner ได้ (ผู้ใช้ในองค์กรเดียวกัน)
create or replace function public.set_platform_owner(_user uuid, _enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'super_admin') then
    raise exception 'เฉพาะผู้ดูแลองค์กรเท่านั้นที่กำหนดสิทธิ์นี้ได้';
  end if;

  if _enabled then
    insert into public.user_roles (user_id, role)
    values (_user, 'platform_owner')
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = _user and role = 'platform_owner';
    update public.profiles set active_organization_id = null where id = _user;
  end if;
end $$;

grant execute on function public.set_platform_owner(uuid, boolean) to authenticated;
