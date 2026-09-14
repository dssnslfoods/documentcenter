-- 0056: แก้บั๊ก 2 เรื่องที่พบระหว่าง UAT
--
-- 1) ลบโครงการไม่ได้เลย: เมื่อลบ projects row จะ cascade ลบ project_members ทีละแถว
--    trigger project_members_keep_exec() เห็นว่ากำลังจะลบผู้บริหารโครงการคนสุดท้าย
--    จึง raise 'โครงการต้องมีผู้บริหารโครงการอย่างน้อย 1 คน' ทำให้การลบทั้งหมดล้มเหลว
--    แก้: ข้ามการตรวจเมื่อโครงการแม่ถูกลบไปแล้ว (กำลัง cascade)
--
-- 2) ผู้สร้างโครงการไม่ได้เป็น exec: trigger projects_after_insert_owner_member() (สร้างก่อนหน้า)
--    เพิ่มผู้สร้างเป็นสมาชิกด้วยค่า default project_role = 'staff'
--    แอปพยายาม insert ซ้ำเป็น 'exec' แต่ชน unique (project_id, user_id) / RLS และแอปไม่ได้เช็ก error
--    ผลคือโครงการใหม่ไม่มี exec เลย และผู้สร้างที่เป็น management แก้ไข/ปิดโครงการตัวเองไม่ได้
--    แก้: trigger ใส่ผู้สร้างเป็น exec ตั้งแต่แรก + backfill โครงการเดิมที่ไม่มี exec

-- ---------------------------------------------------------------------------
-- 1) keep_exec: ไม่ขวางการ cascade delete ของโครงการ
create or replace function public.project_members_keep_exec()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid := coalesce(old.project_id, new.project_id);
  remaining int;
begin
  -- โครงการแม่ถูกลบไปแล้ว (กำลัง cascade) — ไม่ต้องบังคับให้เหลือ exec
  if tg_op = 'DELETE' and not exists (select 1 from public.projects where id = pid) then
    return old;
  end if;

  select count(*) into remaining
  from public.project_members m
  where m.project_id = pid
    and m.project_role = 'exec'
    and m.id <> old.id;

  if remaining = 0 and (tg_op = 'DELETE' or new.project_role <> 'exec') then
    raise exception 'โครงการต้องมีผู้บริหารโครงการอย่างน้อย 1 คน';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- ---------------------------------------------------------------------------
-- 2) ผู้สร้างโครงการ = ผู้บริหารโครงการ (exec)
create or replace function public.projects_after_insert_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_id uuid;
  perm_key text;
  full_perms text[] := array[
    'view_project_info','view_spec_scope','view_supplier_quotation','view_customer_quotation',
    'view_contract','view_milestones','view_all_documents',
    'edit_project','edit_milestones','upload_documents'
  ];
begin
  if new.owner_id is null then
    return new;
  end if;

  insert into public.project_members(project_id, user_id, added_by, project_role, role_title)
  values (new.id, new.owner_id, new.owner_id, 'exec', 'ผู้บริหารโครงการ')
  on conflict (project_id, user_id) do update set project_role = 'exec'
  returning id into member_id;

  foreach perm_key in array full_perms loop
    insert into public.project_member_permissions(project_member_id, permission_key, granted)
    values (member_id, perm_key, true)
    on conflict do nothing;
  end loop;

  return new;
end $$;

-- backfill: โครงการที่ยังไม่มี exec เลย → ยกผู้สร้าง (ที่เป็น super_admin / management) เป็น exec
update public.project_members m
set project_role = 'exec',
    role_title = coalesce(m.role_title, 'ผู้บริหารโครงการ')
from public.projects p
where p.id = m.project_id
  and m.user_id = p.owner_id
  and m.project_role <> 'exec'
  and p.status <> 'completed'
  and (public.has_role(p.owner_id, 'super_admin') or public.has_role(p.owner_id, 'management'))
  and not exists (
    select 1 from public.project_members e
    where e.project_id = p.id and e.project_role = 'exec'
  );
