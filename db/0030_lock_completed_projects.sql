-- 0030: โครงการที่ปิดแล้ว (status = 'completed') ห้ามแก้ไขข้อมูลใดๆ
-- ยกเว้น: การเปลี่ยนสถานะออกจาก completed (เปิดโครงการใหม่) และการ archive

create or replace function public.is_project_locked(_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.projects p
    where p.id = _project_id and p.status = 'completed'
  )
$$;

-- 1) ตาราง projects เอง
create or replace function public.guard_locked_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'completed' then
    -- อนุญาตเฉพาะการเปลี่ยนสถานะ (reopen) หรือการ archive เท่านั้น
    if new.status is distinct from old.status
       or new.archived_at is distinct from old.archived_at then
      return new;
    end if;
    raise exception 'โครงการปิดแล้ว ไม่สามารถแก้ไขข้อมูลได้';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_locked_project on public.projects;
create trigger trg_guard_locked_project
before update on public.projects
for each row execute function public.guard_locked_project();

-- 2) ตารางลูกที่ผูกกับโครงการ
create or replace function public.guard_locked_project_child()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
begin
  pid := coalesce(
    (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end ->> 'project_id')::uuid,
    null
  );
  if pid is not null and public.is_project_locked(pid) then
    raise exception 'โครงการปิดแล้ว ไม่สามารถแก้ไขข้อมูลได้';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'project_documents',
    'project_spec_notes',
    'project_milestones',
    'project_tasks',
    'project_members',
    'supplier_quotations',
    'customer_quotations'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_guard_locked_%1$s on public.%1$I', t);
      execute format(
        'create trigger trg_guard_locked_%1$s before insert or update or delete on public.%1$I
         for each row execute function public.guard_locked_project_child()', t);
    end if;
  end loop;
end $$;
