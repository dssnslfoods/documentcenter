-- 0058: แก้ปัญหาที่เหลือจาก UAT (ฝั่งฐานข้อมูล)
--
--  1) ราคารั่วถึง staff / dept_manager ผ่าน API
--     - ใบเสนอราคา Supplier / ลูกค้า: อ่านได้เฉพาะระดับผู้บริหาร (super_admin, management ในองค์กร, exec ของโครงการ)
--     - คอลัมน์เงินใน projects (budget, contract_value, vat_amount, contract_value_incl_vat)
--       และ project_milestones.payment_value: ปิดการ SELECT ตรง — อ่านผ่าน RPC ที่ตรวจสิทธิ์
--       ⚠ migration ถัดไปที่เพิ่มคอลัมน์ใน projects / project_milestones ต้อง GRANT SELECT คอลัมน์นั้นให้ authenticated เอง
--     - project_history ที่มีตัวเงิน: ติดธง sensitive และซ่อนจากผู้ที่ไม่มีสิทธิ์เห็นเงิน
--  2) management ที่ไม่ได้เป็นสมาชิกโครงการเห็นแท็บใบเสนอราคา/งวดงานว่าง
--  3) ผู้ใช้ทั่วไปแก้ master data ได้ (VAT, tags, work types, partners) และตารางเก่าที่เปิด true
--  4) role_page_access / system_settings / audit_logs ไม่แยกองค์กร
--  5) organization_page_access (0044) ไม่เคยถูกรันบน production
--  6) ผู้รับมอบหมายงานแก้ทุกคอลัมน์ได้ (เช่น ตั้ง accepted เอง) / ส่ง feedback ในโครงการที่ปิดแล้วได้
--  7) แจ้งเตือนครบกำหนดไม่กันซ้ำ และแจ้งโครงการที่ปิด/แพ้แล้ว
--  8) platform_owner ได้สิทธิ์ทุกบทบาทในองค์กรตัวเองโดยไม่ต้องเปิดโหมดสนับสนุน
--     และสร้างผู้ดูแลองค์กรให้องค์กรอื่นไม่ได้
--  9) Supabase advisor: search_path ของ 4 ฟังก์ชัน / trigger function เรียกผ่าน API ได้

-- ===========================================================================
-- 8) platform_owner: สิทธิ์ระดับองค์กรเฉพาะตอนอยู่ในโหมดสนับสนุน
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_user_active(_user_id)
     and exists (
       select 1 from public.user_roles r
       where r.user_id = _user_id
         and (
           r.role = _role
           or (
             r.role = 'platform_owner'
             and exists (
               select 1 from public.profiles p
               where p.id = _user_id
                 and p.active_organization_id is not null
                 and public.support_access_active(p.active_organization_id)
             )
           )
         )
     );
$$;

-- ผู้ดูแลแพลตฟอร์มจัดการบัญชี/บทบาทผู้ใช้ข้ามองค์กรได้ (หน้า แพลตฟอร์ม → ผู้ดูแลองค์กร)
drop policy if exists "profiles_platform_owner_all" on public.profiles;
create policy "profiles_platform_owner_all" on public.profiles
for all to authenticated using (public.is_platform_owner()) with check (public.is_platform_owner());

drop policy if exists "org_isolation" on public.profiles;
create policy "org_isolation" on public.profiles as restrictive
for all to authenticated
using ((id = auth.uid()) or public.is_platform_owner() or public.org_visible(organization_id))
with check ((id = auth.uid()) or public.is_platform_owner() or public.org_visible(organization_id));

drop policy if exists "user_roles_platform_owner_all" on public.user_roles;
create policy "user_roles_platform_owner_all" on public.user_roles
for all to authenticated using (public.is_platform_owner()) with check (public.is_platform_owner());

drop policy if exists "org_isolation" on public.user_roles;
create policy "org_isolation" on public.user_roles as restrictive
for all to authenticated
using ((user_id = auth.uid()) or public.is_platform_owner() or public.org_visible(public.user_org(user_id)))
with check ((user_id = auth.uid()) or public.is_platform_owner() or public.org_visible(public.user_org(user_id)));

-- ===========================================================================
-- 1) + 2) สิทธิ์เห็นเงินของโครงการ
create or replace function public.can_see_project_money(_uid uuid, _project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_user_active(_uid)
     and exists (
       select 1 from public.projects p
       where p.id = _project_id and public.org_visible(p.organization_id)
     )
     and (
       public.has_role(_uid, 'super_admin')
       or public.has_role(_uid, 'management')
       or public.project_role_of(_uid, _project_id) = 'exec'
     );
$$;

drop policy if exists "sq_read" on public.supplier_quotations;
create policy "sq_read" on public.supplier_quotations
for select to authenticated using (public.can_see_project_money(auth.uid(), project_id));

drop policy if exists "cq_read" on public.customer_quotations;
create policy "cq_read" on public.customer_quotations
for select to authenticated using (public.can_see_project_money(auth.uid(), project_id));

-- งวดงาน: สมาชิก + ผู้บริหารในองค์กร (ตัวเงินแยกไปอ่านผ่าน RPC)
drop policy if exists "pmil_read" on public.project_milestones;
create policy "pmil_read" on public.project_milestones
for select to authenticated using (
  public.has_role(auth.uid(), 'super_admin')
  or public.is_project_member(auth.uid(), project_id)
  or public.can_see_project_money(auth.uid(), project_id)
);

-- คอลัมน์เงิน: ปิด SELECT ตรง
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'projects'
    and column_name not in ('budget', 'contract_value', 'vat_amount', 'contract_value_incl_vat');
  execute 'revoke select on public.projects from anon, authenticated';
  execute format('grant select (%s) on public.projects to authenticated', cols);

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'project_milestones'
    and column_name <> 'payment_value';
  execute 'revoke select on public.project_milestones from anon, authenticated';
  execute format('grant select (%s) on public.project_milestones to authenticated', cols);
end $$;

create or replace function public.project_financials(_project_ids uuid[])
returns table (
  project_id uuid,
  budget numeric,
  contract_value numeric,
  vat_amount numeric,
  contract_value_incl_vat numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.budget, p.contract_value, p.vat_amount, p.contract_value_incl_vat
  from public.projects p
  where p.id = any(_project_ids)
    and public.can_see_project_money(auth.uid(), p.id);
$$;

create or replace function public.project_milestone_payments(_project_id uuid)
returns table (id uuid, payment_value numeric)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.payment_value
  from public.project_milestones m
  where m.project_id = _project_id
    and public.can_see_project_money(auth.uid(), _project_id);
$$;

-- ประวัติการแก้ไขที่มีตัวเงิน
alter table public.project_history
  add column if not exists sensitive boolean not null default false;

update public.project_history h
set sensitive = true
where not h.sensitive
  and (
    h.entity in ('supplier_quotations', 'customer_quotations')
    or exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(h.changes) = 'array' then h.changes else '[]'::jsonb end) e
      where e->>'field' in ('budget', 'contract_value', 'vat_amount', 'contract_value_incl_vat', 'payment_value')
    )
  );

drop policy if exists "ph_read" on public.project_history;
create policy "ph_read" on public.project_history
for select to authenticated using (
  (
    public.has_role(auth.uid(), 'super_admin')
    or public.has_role(auth.uid(), 'management')
    or public.is_project_member(auth.uid(), project_id)
  )
  and (not sensitive or public.can_see_project_money(auth.uid(), project_id))
);

-- ประวัติถูกเขียนโดย trigger เท่านั้น
drop policy if exists "ph_insert" on public.project_history;

create or replace function public.projects_track_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  diffs jsonb := '[]'::jsonb;
  money_diffs jsonb := '[]'::jsonb;
  k text;
  old_j jsonb;
  new_j jsonb;
  d jsonb;
  skip_keys text[] := array['updated_at','updated_by','created_at','created_by','id'];
  money_keys text[] := array['budget','contract_value','vat_amount','contract_value_incl_vat'];
begin
  if tg_op = 'INSERT' then
    insert into public.project_history(project_id, changed_by, action, changes)
    values (new.id, coalesce(new.created_by, auth.uid()), 'create', '[]'::jsonb);
    return new;
  end if;

  old_j := to_jsonb(old);
  new_j := to_jsonb(new);

  for k in select jsonb_object_keys(new_j) loop
    if k = any(skip_keys) then continue; end if;
    if coalesce(old_j -> k, 'null'::jsonb) is distinct from coalesce(new_j -> k, 'null'::jsonb) then
      d := jsonb_build_object('field', k, 'old', old_j -> k, 'new', new_j -> k);
      if k = any(money_keys) then
        money_diffs := money_diffs || d;
      else
        diffs := diffs || d;
      end if;
    end if;
  end loop;

  if jsonb_array_length(diffs) > 0 then
    insert into public.project_history(project_id, changed_by, action, changes)
    values (new.id, coalesce(new.updated_by, auth.uid()), 'update', diffs);
  end if;
  if jsonb_array_length(money_diffs) > 0 then
    insert into public.project_history(project_id, changed_by, action, changes, sensitive)
    values (new.id, coalesce(new.updated_by, auth.uid()), 'update', money_diffs, true);
  end if;

  return new;
end $$;

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
  is_sensitive boolean;
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
    for k in select jsonb_object_keys(case when act = 'create' then new_j else old_j end) loop
      if k = any(skip_keys) then continue; end if;
      if act = 'create' and coalesce(new_j -> k, 'null'::jsonb) <> 'null'::jsonb then
        diffs := diffs || jsonb_build_object('field', k, 'old', null, 'new', new_j -> k);
      elsif act = 'delete' and coalesce(old_j -> k, 'null'::jsonb) <> 'null'::jsonb then
        diffs := diffs || jsonb_build_object('field', k, 'old', old_j -> k, 'new', null);
      end if;
    end loop;
  end if;

  is_sensitive := entity_name in ('supplier_quotations', 'customer_quotations')
    or exists (select 1 from jsonb_array_elements(diffs) e where e->>'field' = 'payment_value');

  insert into public.project_history(project_id, changed_by, action, changes, entity, entity_id, entity_label, sensitive)
  values (pid, auth.uid(), act, diffs, entity_name, eid, lbl, is_sensitive);

  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- ===========================================================================
-- 3) master data / ตารางเก่าที่เปิด true
drop policy if exists "vat_rates_write" on public.vat_rates;
create policy "vat_rates_write" on public.vat_rates
for all to authenticated
using (public.has_role(auth.uid(), 'super_admin'))
with check (public.has_role(auth.uid(), 'super_admin'));

drop policy if exists "tags_manage" on public.tags;
create policy "tags_manage" on public.tags
for all to authenticated
using (public.has_role(auth.uid(), 'super_admin'))
with check (public.has_role(auth.uid(), 'super_admin'));

-- เพิ่มประเภทงานจากหน้าสร้างโครงการได้ (ผู้สร้างโครงการ = super_admin / management)
drop policy if exists "work_types_insert_authenticated" on public.work_types;
create policy "work_types_insert_authenticated" on public.work_types
for insert to authenticated
with check (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'management'));

drop policy if exists "partners_manage" on public.partners;
create policy "partners_manage" on public.partners
for all to authenticated
using (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'management'))
with check (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'management'));

drop policy if exists "qi_view" on public.quotation_items;
drop policy if exists "qi_write" on public.quotation_items;
create policy "qi_manage" on public.quotation_items
for all to authenticated
using (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'management'))
with check (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'management'));

drop policy if exists "cal_write" on public.calendar_events;
drop policy if exists "cal_view" on public.calendar_events;
create policy "cal_view" on public.calendar_events
for select to authenticated using (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'management'));
create policy "cal_write" on public.calendar_events
for all to authenticated
using (public.has_role(auth.uid(), 'super_admin'))
with check (public.has_role(auth.uid(), 'super_admin'));

drop policy if exists "rem_write" on public.reminders;
drop policy if exists "rem_view" on public.reminders;
create policy "rem_manage" on public.reminders
for all to authenticated
using (public.has_role(auth.uid(), 'super_admin'))
with check (public.has_role(auth.uid(), 'super_admin'));

drop policy if exists "com_view" on public.comments;
create policy "com_view" on public.comments
for select to authenticated using (author_id = auth.uid() or public.has_role(auth.uid(), 'super_admin'));

-- ===========================================================================
-- 4) ตั้งค่าที่ต้องแยกตามองค์กร
do $$
declare
  first_org uuid := (select id from public.organizations order by created_at nulls last, id limit 1);
begin
  -- role_page_access
  alter table public.role_page_access add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
  update public.role_page_access set organization_id = first_org where organization_id is null;
  insert into public.role_page_access (organization_id, role, page_key, allowed)
  select o.id, r.role, r.page_key, r.allowed
  from public.role_page_access r
  cross join public.organizations o
  where r.organization_id = first_org and o.id <> first_org
  on conflict do nothing;
  alter table public.role_page_access alter column organization_id set not null;
  alter table public.role_page_access drop constraint if exists role_page_access_role_page_key_key;
  if not exists (select 1 from pg_constraint where conname = 'role_page_access_org_role_page_key') then
    alter table public.role_page_access add constraint role_page_access_org_role_page_key unique (organization_id, role, page_key);
  end if;

  -- system_settings
  alter table public.system_settings add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
  update public.system_settings set organization_id = first_org where organization_id is null;
  insert into public.system_settings (organization_id, key, value)
  select o.id, s.key, s.value
  from public.system_settings s
  cross join public.organizations o
  where s.organization_id = first_org and o.id <> first_org;
  alter table public.system_settings alter column organization_id set not null;
  alter table public.system_settings drop constraint if exists system_settings_pkey;
  alter table public.system_settings add constraint system_settings_pkey primary key (organization_id, key);

  -- audit_logs
  alter table public.audit_logs add column if not exists organization_id uuid references public.organizations(id) on delete set null;
  update public.audit_logs a
  set organization_id = coalesce((select p.organization_id from public.profiles p where p.id = a.user_id), first_org)
  where a.organization_id is null;
end $$;

drop trigger if exists role_page_access_set_org_id on public.role_page_access;
create trigger role_page_access_set_org_id before insert on public.role_page_access
for each row execute function public.set_org_id();
drop trigger if exists system_settings_set_org_id on public.system_settings;
create trigger system_settings_set_org_id before insert on public.system_settings
for each row execute function public.set_org_id();
drop trigger if exists audit_logs_set_org_id on public.audit_logs;
create trigger audit_logs_set_org_id before insert on public.audit_logs
for each row execute function public.set_org_id();

drop policy if exists "org_isolation" on public.role_page_access;
create policy "org_isolation" on public.role_page_access as restrictive
for all to authenticated using (public.org_visible(organization_id)) with check (public.org_visible(organization_id));
drop policy if exists "org_isolation" on public.system_settings;
create policy "org_isolation" on public.system_settings as restrictive
for all to authenticated using (public.org_visible(organization_id)) with check (public.org_visible(organization_id));
drop policy if exists "org_isolation" on public.audit_logs;
create policy "org_isolation" on public.audit_logs as restrictive
for all to authenticated using (public.org_visible(organization_id)) with check (public.org_visible(organization_id));

-- ===========================================================================
-- 5) organization_page_access (เนื้อหาเดียวกับ 0044 ที่ไม่เคยถูกรัน)
create table if not exists public.organization_page_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  page_key text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (organization_id, page_key)
);
create index if not exists opa_org_idx on public.organization_page_access(organization_id);
grant select, insert, update, delete on public.organization_page_access to authenticated;
grant all on public.organization_page_access to service_role;
alter table public.organization_page_access enable row level security;

drop policy if exists opa_read on public.organization_page_access;
create policy opa_read on public.organization_page_access
for select to authenticated
using (public.is_platform_owner() or organization_id = public.current_org_id());

drop policy if exists opa_write on public.organization_page_access;
create policy opa_write on public.organization_page_access
for all to authenticated
using (public.is_platform_owner())
with check (public.is_platform_owner());

drop trigger if exists opa_set_updated_at on public.organization_page_access;
create trigger opa_set_updated_at before update on public.organization_page_access
for each row execute function public.set_updated_at();

insert into public.organization_page_access (organization_id, page_key, enabled)
select o.id, k, true
from public.organizations o
cross join unnest(array[
  'dashboard','calendar','notifications','projects','assignments','quotations','partners',
  'documents','contracts','reports','audit-log','settings'
]) as k
on conflict (organization_id, page_key) do nothing;

-- ===========================================================================
-- 6) งานที่ได้รับมอบหมาย
drop trigger if exists trg_guard_locked_project_task_updates on public.project_task_updates;
create trigger trg_guard_locked_project_task_updates
before insert or update or delete on public.project_task_updates
for each row execute function public.guard_locked_project_child();

-- ผู้รับมอบหมาย (ที่ไม่มีสิทธิ์แก้แผนงาน) แก้ได้เฉพาะความคืบหน้า และ รับทราบ / ส่งมอบ
create or replace function public.guard_task_assignee_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  allowed_keys text[] := array['progress','status','assignment_status','acknowledged_at','submitted_at','updated_at'];
begin
  if _uid is null
     or public.has_role(_uid, 'super_admin')
     or public.has_project_permission(_uid, new.project_id, 'edit_milestones') then
    return new;
  end if;

  if (to_jsonb(new) - allowed_keys) is distinct from (to_jsonb(old) - allowed_keys) then
    raise exception 'ผู้รับมอบหมายแก้ไขได้เฉพาะความคืบหน้าและสถานะการส่งมอบงาน';
  end if;

  if new.assignment_status is distinct from old.assignment_status
     and not (
       (old.assignment_status = 'assigned' and new.assignment_status = 'acknowledged')
       or (old.assignment_status in ('acknowledged', 'revision') and new.assignment_status = 'in_review')
     ) then
    raise exception 'ผู้รับมอบหมายเปลี่ยนสถานะงานเป็น "%" ไม่ได้', new.assignment_status;
  end if;

  if new.status is distinct from old.status and new.status = 'done' then
    raise exception 'งานจะเสร็จสิ้นเมื่อผู้บริหารโครงการรับมอบเท่านั้น';
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_task_assignee_update on public.project_tasks;
create trigger trg_guard_task_assignee_update
before update on public.project_tasks
for each row execute function public.guard_task_assignee_update();

-- ===========================================================================
-- 7) แจ้งเตือนครบกำหนด: ไม่รวมโครงการที่ปิด/แพ้แล้ว และกันซ้ำวันละครั้ง
create or replace function public.notify_once_today(_user_id uuid, _title text, _body text, _type text, _link text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.notifications n
    where n.user_id = _user_id and n.type = _type and n.title = _title
      and n.created_at >= date_trunc('day', now())
  ) then
    perform public.create_notification(_user_id, _title, _body, _type, _link);
  end if;
end $$;

create or replace function public.scan_due_date_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  rec record;
begin
  for rec in
    select m.project_id, p.name as project_name, m.description, m.due_date,
           (m.due_date < current_date) as overdue
    from public.project_milestones m
    join public.projects p on p.id = m.project_id
    where p.status not in ('completed', 'lost') and p.archived_at is null
      and m.status not in ('completed', 'postponed', 'failed')
      and m.due_date <= current_date + interval '3 days'
  loop
    for v_member_id in select user_id from public.project_members where project_id = rec.project_id loop
      if rec.overdue then
        perform public.notify_once_today(v_member_id,
          format('งวดงาน "%s" เลยกำหนด (ครบวันที่ %s)', rec.description, rec.due_date),
          format('โครงการ %s มีงวดงานเลยกำหนดส่งมอบ', rec.project_name),
          'milestone_overdue', format('/projects/%s', rec.project_id));
      else
        perform public.notify_once_today(v_member_id,
          format('งวดงาน "%s" ใกล้ครบกำหนด (%s)', rec.description, rec.due_date),
          format('โครงการ %s มีงวดงานที่กำหนดส่งมอบวันที่ %s', rec.project_name, rec.due_date),
          'milestone_due_soon', format('/projects/%s', rec.project_id));
      end if;
    end loop;
  end loop;

  for rec in
    select t.project_id, p.name as project_name, t.name, t.end_date,
           (t.end_date < current_date) as overdue
    from public.project_tasks t
    join public.projects p on p.id = t.project_id
    where p.status not in ('completed', 'lost') and p.archived_at is null
      and t.status <> 'done'
      and t.end_date <= current_date + interval '3 days'
  loop
    for v_member_id in select user_id from public.project_members where project_id = rec.project_id loop
      if rec.overdue then
        perform public.notify_once_today(v_member_id,
          format('งาน "%s" เลยกำหนด (ครบวันที่ %s)', rec.name, rec.end_date),
          format('โครงการ %s มีงานเลยกำหนดเสร็จ', rec.project_name),
          'task_overdue', format('/projects/%s', rec.project_id));
      else
        perform public.notify_once_today(v_member_id,
          format('งาน "%s" ใกล้ครบกำหนด (%s)', rec.name, rec.end_date),
          format('โครงการ %s มีงานที่กำหนดเสร็จวันที่ %s', rec.project_name, rec.end_date),
          'task_due_soon', format('/projects/%s', rec.project_id));
      end if;
    end loop;
  end loop;
end $$;

create or replace function public.scan_assignment_due_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
begin
  for rec in
    select t.name, t.end_date, t.project_id, p.name as project_name, t.assignee_id
    from public.project_tasks t
    join public.projects p on p.id = t.project_id
    where p.status not in ('completed', 'lost') and p.archived_at is null
      and t.assignee_id is not null
      and coalesce(t.assignment_status, 'draft') in ('assigned', 'acknowledged', 'revision')
      and t.end_date <= current_date + interval '1 day'
  loop
    if rec.end_date < current_date then
      perform public.notify_once_today(rec.assignee_id,
        format('งานที่คุณรับผิดชอบเลยกำหนดส่งมอบ: %s', rec.name),
        format('โครงการ %s — ครบกำหนดวันที่ %s', rec.project_name, to_char(rec.end_date, 'DD/MM/YYYY')),
        'assignment_overdue', format('/assignments/board/%s', rec.project_id));
    elsif rec.end_date = current_date then
      perform public.notify_once_today(rec.assignee_id,
        format('ครบกำหนดส่งมอบวันนี้: %s', rec.name),
        format('โครงการ %s — กรุณาส่งมอบงานภายในวันนี้', rec.project_name),
        'assignment_due_today', format('/assignments/board/%s', rec.project_id));
    else
      perform public.notify_once_today(rec.assignee_id,
        format('ครบกำหนดส่งมอบพรุ่งนี้: %s', rec.name),
        format('โครงการ %s — กำหนดส่งมอบ %s', rec.project_name, to_char(rec.end_date, 'DD/MM/YYYY')),
        'assignment_due_tomorrow', format('/assignments/board/%s', rec.project_id));
    end if;
  end loop;
end $$;

-- ===========================================================================
-- 9) advisor
alter function public.set_updated_at() set search_path = public;
alter function public.documents_before_update() set search_path = public;
alter function public.touch_project_spec_notes() set search_path = public;
alter function public.touch_contract_notes() set search_path = public;

-- สิทธิ์เรียกฟังก์ชัน: ไม่มีใครเรียก trigger function / ฟังก์ชันภายในผ่าน API
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn, p.prorettype = 'trigger'::regtype as is_trigger
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', r.fn);
    if r.is_trigger then
      execute format('revoke execute on function %s from authenticated', r.fn);
    else
      execute format('grant execute on function %s to authenticated', r.fn);
    end if;
    execute format('grant execute on function %s to service_role', r.fn);
  end loop;
end $$;

revoke execute on function public.create_notification(uuid, text, text, text, text) from authenticated;
revoke execute on function public.notify_once_today(uuid, text, text, text, text) from authenticated;
revoke execute on function public.scan_due_date_notifications() from authenticated;
revoke execute on function public.scan_assignment_due_notifications() from authenticated;
revoke execute on function public.update_project_health(uuid) from authenticated;
