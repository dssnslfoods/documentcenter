-- 0026: Project role model
--   exec      = ผู้บริหารโครงการ (super_admin / management only) — full rights
--   dept_head = หัวหน้าแผนก — เห็นและแก้ไขแผนงาน (timeline) เท่านั้น
--   staff     = เจ้าหน้าที่ — เห็นแผนงานอย่างเดียว
-- ทุกโครงการต้องมีผู้บริหารโครงการอย่างน้อย 1 คน
-- และเฉพาะ super_admin / management เท่านั้นที่สร้างโครงการได้

alter table public.project_members
  add column if not exists project_role text not null default 'staff';

do $$ begin
  alter table public.project_members
    add constraint project_members_project_role_check
    check (project_role in ('exec','dept_head','staff'));
exception when duplicate_object then null; end $$;

create index if not exists project_members_role_idx on public.project_members(project_id, project_role);

-- Backfill from global roles
update public.project_members m
set project_role = 'exec'
where exists (
  select 1 from public.user_roles r
  where r.user_id = m.user_id and r.role in ('super_admin','management')
);

update public.project_members m
set project_role = 'dept_head'
where project_role = 'staff'
  and exists (
    select 1 from public.user_roles r
    where r.user_id = m.user_id and r.role = 'dept_manager'
  );

-- Project owner is always an exec
update public.project_members m
set project_role = 'exec'
from public.projects p
where p.id = m.project_id and m.user_id = coalesce(p.owner_id, p.created_by);

-- ---------- helpers ----------
create or replace function public.project_role_of(_user_id uuid, _project_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when public.has_role(_user_id,'super_admin') or public.has_role(_user_id,'management') then
      coalesce((select m.project_role from public.project_members m
                where m.project_id = _project_id and m.user_id = _user_id), 'exec')
    else (select m.project_role from public.project_members m
          where m.project_id = _project_id and m.user_id = _user_id)
  end
$$;

create or replace function public.is_project_exec(_user_id uuid, _project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id,'super_admin')
      or coalesce(public.project_role_of(_user_id, _project_id) = 'exec', false)
$$;

-- Project-level permission resolution now follows the project role
create or replace function public.has_project_permission(_user_id uuid, _project_id uuid, _key text)
returns boolean language sql stable security definer set search_path = public as $$
  with r as (select public.project_role_of(_user_id, _project_id) as pr)
  select
    public.has_role(_user_id,'super_admin')
    or (select pr from r) = 'exec'
    or ((select pr from r) = 'dept_head' and _key in ('view_milestones','edit_milestones','view_project_info'))
    or ((select pr from r) = 'staff' and _key in ('view_milestones','view_project_info'))
$$;

-- Managers no longer get blanket project edit rights: exec only
create or replace function public.is_project_manager(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_uid, 'super_admin')
$$;

drop policy if exists "prj_read" on public.projects;
drop policy if exists "prj_update" on public.projects;
drop policy if exists "prj_insert" on public.projects;

create policy "prj_read" on public.projects for select to authenticated using (
  public.has_role(auth.uid(),'super_admin')
  or public.has_role(auth.uid(),'management')
  or owner_id = auth.uid()
  or public.is_project_member(auth.uid(), id)
);

create policy "prj_insert" on public.projects for insert to authenticated with check (
  public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'management')
);

create policy "prj_update" on public.projects for update to authenticated using (
  public.is_project_exec(auth.uid(), id)
) with check (
  public.is_project_exec(auth.uid(), id)
);

-- Project execs can manage the team
drop policy if exists "pm_exec_all" on public.project_members;
create policy "pm_exec_all" on public.project_members for all to authenticated
  using (public.is_project_exec(auth.uid(), project_id))
  with check (public.is_project_exec(auth.uid(), project_id));

drop policy if exists "pmp_exec_all" on public.project_member_permissions;
create policy "pmp_exec_all" on public.project_member_permissions for all to authenticated
  using (exists (select 1 from public.project_members m
                 where m.id = project_member_id and public.is_project_exec(auth.uid(), m.project_id)))
  with check (exists (select 1 from public.project_members m
                 where m.id = project_member_id and public.is_project_exec(auth.uid(), m.project_id)));

-- ---------- guard: at least one exec per project ----------
create or replace function public.project_members_keep_exec()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pid uuid := coalesce(old.project_id, new.project_id);
  remaining int;
begin
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

drop trigger if exists project_members_keep_exec_trg on public.project_members;
create trigger project_members_keep_exec_trg
  before update or delete on public.project_members
  for each row when (old.project_role = 'exec')
  execute function public.project_members_keep_exec();
