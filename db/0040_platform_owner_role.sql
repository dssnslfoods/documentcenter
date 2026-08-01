-- 0040: เพิ่มบทบาทระดับแพลตฟอร์ม (ผู้ดูแลระบบของทั้งระบบ / ทุกองค์กร)
-- ต้องรันไฟล์นี้ให้เสร็จ (commit) ก่อนรัน 0041 เพราะ Postgres ไม่อนุญาตให้ใช้
-- ค่า enum ใหม่ภายใน transaction เดียวกับที่สร้างค่านั้น
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'app_role' and e.enumlabel = 'platform_owner'
  ) then
    alter type public.app_role add value 'platform_owner';
  end if;
end $$;
