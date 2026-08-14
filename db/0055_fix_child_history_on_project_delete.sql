-- 0055: แก้ child_track_history() ให้ไม่พังตอนลบโครงการ
--
-- เมื่อลบ projects row จะ cascade ลบตารางลูก (project_spec_notes, project_tasks, ...)
-- ซึ่งแต่ละตารางมี trigger child_track_history() (0039) พยายาม insert เข้า project_history
-- โดยอ้าง project_id ของโครงการที่เพิ่งถูกลบไป — ชน foreign key constraint เสมอ
-- (project_history.project_id references projects(id))
--
-- แก้โดยข้ามการบันทึกประวัติ เมื่อเป็น action='delete' และโครงการแม่ไม่มีอยู่แล้ว
-- (ไม่มีประโยชน์ต้องบันทึกอยู่ดี เพราะ project_history ของโครงการนี้จะถูกลบตามไปด้วย)

create or replace function public.child_track_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  entity_name text := tg_argv[0];
  label_keys text[] := case when tg_nargs > 1 then string_to_array(tg_argv[1], ',') else array['title','name','document_name'] end;
  old_j jsonb;
  new_j jsonb;
  diffs jsonb := '[]'::jsonb;
  k text;
  lbl text;
  pid uuid;
  eid uuid;
  act text;
  skip_keys text[] := array['updated_at','created_at','id','project_id','created_by','updated_by','sort_order'];
begin
  if tg_op = 'DELETE' then
    old_j := to_jsonb(old); new_j := '{}'::jsonb; act := 'delete';
  elsif tg_op = 'INSERT' then
    old_j := '{}'::jsonb; new_j := to_jsonb(new); act := 'create';
  else
    old_j := to_jsonb(old); new_j := to_jsonb(new); act := 'update';
  end if;

  pid := ((case when tg_op = 'DELETE' then old_j else new_j end) ->> 'project_id')::uuid;
  eid := ((case when tg_op = 'DELETE' then old_j else new_j end) ->> 'id')::uuid;
  if pid is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- โครงการแม่ถูกลบไปแล้ว (กำลัง cascade) — ข้ามการบันทึกประวัติ
  if act = 'delete' and not exists (select 1 from public.projects where id = pid) then
    return old;
  end if;

  -- ป้ายชื่อรายการ (เอาคีย์แรกที่มีค่า)
  foreach k in array label_keys loop
    lbl := coalesce(lbl, nullif((case when tg_op = 'DELETE' then old_j else new_j end) ->> trim(k), ''));
  end loop;

  if act = 'update' then
    for k in select jsonb_object_keys(new_j) loop
      if k = any(skip_keys) then continue; end if;
      if coalesce(old_j -> k, 'null'::jsonb) is distinct from coalesce(new_j -> k, 'null'::jsonb) then
        diffs := diffs || jsonb_build_object('field', k, 'old', old_j -> k, 'new', new_j -> k);
      end if;
    end loop;
    if jsonb_array_length(diffs) = 0 then
      return new;
    end if;
  else
    -- create / delete: เก็บค่าที่ไม่ว่างไว้ทั้งชุดเพื่อการสืบค้นย้อนหลัง
    for k in select jsonb_object_keys(case when act = 'create' then new_j else old_j end) loop
      if k = any(skip_keys) then continue; end if;
      if act = 'create' and coalesce(new_j -> k, 'null'::jsonb) <> 'null'::jsonb then
        diffs := diffs || jsonb_build_object('field', k, 'old', null, 'new', new_j -> k);
      elsif act = 'delete' and coalesce(old_j -> k, 'null'::jsonb) <> 'null'::jsonb then
        diffs := diffs || jsonb_build_object('field', k, 'old', old_j -> k, 'new', null);
      end if;
    end loop;
  end if;

  insert into public.project_history(project_id, changed_by, action, changes, entity, entity_id, entity_label)
  values (pid, auth.uid(), act, diffs, entity_name, eid, lbl);

  return case when tg_op = 'DELETE' then old else new end;
end $$;
