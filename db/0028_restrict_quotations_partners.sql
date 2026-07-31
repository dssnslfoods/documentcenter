-- 0028: จำกัดเมนู "ใบเสนอราคา" และ "คู่ค้าและลูกค้า" ให้เห็นเฉพาะผู้ดูแลระบบสูงสุด และผู้บริหาร

insert into public.role_page_access (role, page_key, allowed) values
  ('super_admin','quotations',true),('super_admin','partners',true),
  ('management','quotations',true),('management','partners',true),
  ('dept_manager','quotations',false),('dept_manager','partners',false),
  ('staff','quotations',false),('staff','partners',false),
  ('viewer','quotations',false),('viewer','partners',false)
on conflict (role, page_key) do update
  set allowed = excluded.allowed, updated_at = now();
