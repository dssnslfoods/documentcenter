-- 0043: ตั้งบัญชี platform_owner (ผู้ดูแลระบบแพลตฟอร์ม)
--
-- วิธีใช้
--   1) สมัครสมาชิกด้วยอีเมลด้านล่างในหน้า /auth ของแอปก่อน (หรือสร้าง user ใน Supabase Dashboard > Authentication)
--   2) รันไฟล์นี้ใน Supabase SQL Editor
--   หากต้องการเปลี่ยนอีเมล ให้แก้ค่า _email ด้านล่างเพียงจุดเดียว

do $$
declare
  _email text := 'contact@d2infinite.com';
  _uid   uuid;
begin
  select id into _uid from auth.users where lower(email) = lower(_email) limit 1;

  if _uid is null then
    raise exception 'ไม่พบผู้ใช้อีเมล % ใน auth.users — กรุณาสมัครสมาชิกด้วยอีเมลนี้ก่อน แล้วรันไฟล์นี้อีกครั้ง', _email;
  end if;

  -- ให้มี profile เสมอ
  insert into public.profiles (id, email, full_name)
  values (_uid, _email, coalesce(split_part(_email, '@', 1), 'Platform Owner'))
  on conflict (id) do nothing;

  -- platform_owner ไม่ผูกกับองค์กรใดองค์กรหนึ่ง (เห็นทุกองค์กร)
  update public.profiles
     set active_organization_id = null
   where id = _uid;

  -- ให้บทบาท platform_owner
  insert into public.user_roles (user_id, role)
  values (_uid, 'platform_owner')
  on conflict (user_id, role) do nothing;

  -- ลบบทบาทอื่นออก เพื่อให้เป็นบัญชีดูแลแพลตฟอร์มล้วน ๆ
  delete from public.user_roles
   where user_id = _uid and role <> 'platform_owner';

  raise notice 'ตั้งค่า platform_owner ให้ % (%) เรียบร้อย', _email, _uid;
end $$;

-- ให้ platform_owner เข้าถึงได้ทุกเมนู
insert into public.role_page_access (role, page_key, allowed)
select 'platform_owner', page_key, true
  from (select distinct page_key from public.role_page_access) p
on conflict (role, page_key) do update set allowed = true;
