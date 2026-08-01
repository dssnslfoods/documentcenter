-- 0046: คืน/ยืนยันบทบาท platform_owner (ไม่ลบบทบาทอื่น)
-- แก้อีเมลด้านล่างได้ตามต้องการ แล้วรันไฟล์นี้ใน SQL Editor
do $$
declare
  _email text := 'contact@d2infinite.com';
  _uid   uuid;
begin
  select id into _uid from auth.users where lower(email) = lower(_email) limit 1;
  if _uid is null then
    raise exception 'ไม่พบผู้ใช้อีเมล %', _email;
  end if;

  insert into public.user_roles (user_id, role)
  values (_uid, 'platform_owner')
  on conflict (user_id, role) do nothing;

  -- ผู้ดูแลแพลตฟอร์มต้องไม่ค้างสถานะองค์กร (ต้องกดสลับเข้าโหมดสนับสนุนเอง)
  update public.profiles set active_organization_id = null where id = _uid;

  raise notice 'platform_owner -> % (%)', _email, _uid;
end $$;

-- ตรวจสอบผล
select u.email, r.role
  from public.user_roles r join auth.users u on u.id = r.user_id
 where lower(u.email) = lower('contact@d2infinite.com');
