-- 0029: จำกัดเมนู "รายงาน" ให้เห็นเฉพาะผู้ดูแลระบบสูงสุด และผู้บริหาร

insert into public.role_page_access (role, page_key, allowed) values
  ('super_admin','reports',true),
  ('management','reports',true),
  ('dept_manager','reports',false),
  ('staff','reports',false),
  ('viewer','reports',false)
on conflict (role, page_key) do update
  set allowed = excluded.allowed, updated_at = now();
