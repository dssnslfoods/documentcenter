-- 0039: ประวัติการแก้ไขแบบละเอียด — บันทึกทุกตารางที่ผูกกับโครงการ
-- (เดิมบันทึกเฉพาะตาราง projects เท่านั้น)

-- 1) เพิ่มคอลัมน์ระบุว่าเป็นการแก้ไข "เรื่องอะไร" และ "รายการไหน"
alter table public.project_history
  add column if not exists entity text not null default 'project',
  add column if not exists entity_id uuid,
  add column if not exists entity_label text;

create index if not exists project_history_entity_idx
  on public.project_history(project_id, entity, created_at desc);

-- 2) ฟังก์ชันกลางสำหรับตารางลูก: บันทึก insert / update / delete พร้อม diff รายฟิลด์
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

-- 3) ติดตั้ง trigger ให้ทุกตารางลูก (ข้ามตารางที่ยังไม่มีในระบบ)
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('project_documents',   'document_name,title'),
      ('project_spec_notes',  'title,heading'),
      ('project_milestones',  'title,name'),
      ('project_tasks',       'title,name'),
      ('project_members',     'role_title,role'),
      ('supplier_quotations', 'title,quotation_no,supplier_name'),
      ('customer_quotations', 'title,quotation_no,customer_name')
    ) as t(tbl, labels)
  loop
    if to_regclass('public.' || r.tbl) is not null then
      execute format('drop trigger if exists trg_hist_%1$s on public.%1$I', r.tbl);
      execute format(
        'create trigger trg_hist_%1$s after insert or update or delete on public.%1$I
         for each row execute function public.child_track_history(%2$L, %3$L)',
        r.tbl, r.tbl, r.labels);
    end if;
  end loop;
end $$;
