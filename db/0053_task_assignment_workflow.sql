-- 0053: มอบหมายและติดตามงานสมาชิก (assign → รับทราบ → feedback → ส่งมอบ → รับมอบ)

alter table public.project_tasks
  add column if not exists assignment_status text not null default 'draft',
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by uuid references auth.users(id),
  add column if not exists acknowledged_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists accepted_at timestamptz;

do $$ begin
  alter table public.project_tasks
    add constraint project_tasks_assignment_status_check
    check (assignment_status in ('draft','assigned','acknowledged','in_review','revision','accepted'));
exception when duplicate_object then null; end $$;

create index if not exists ptask_assignee_idx on public.project_tasks(assignee_id, assignment_status);

-- ---------------- บันทึกการสื่อสารระหว่างผู้บริหารโครงการกับสมาชิก ----------------
create table if not exists public.project_task_updates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('assign','acknowledge','feedback','submit','accept','revision')),
  message text,
  progress smallint check (progress between 0 and 100),
  created_at timestamptz not null default now()
);

create index if not exists ptu_task_idx on public.project_task_updates(task_id, created_at desc);

grant select, insert, delete on public.project_task_updates to authenticated;
grant all on public.project_task_updates to service_role;

alter table public.project_task_updates enable row level security;

drop policy if exists "ptu_read" on public.project_task_updates;
create policy "ptu_read" on public.project_task_updates for select to authenticated using (
  public.has_role(auth.uid(),'super_admin')
  or public.is_project_member(auth.uid(), project_id)
);

drop policy if exists "ptu_insert" on public.project_task_updates;
create policy "ptu_insert" on public.project_task_updates for insert to authenticated with check (
  author_id = auth.uid()
  and (
    public.has_role(auth.uid(),'super_admin')
    or public.has_project_permission(auth.uid(), project_id, 'edit_milestones')
    or exists (select 1 from public.project_tasks t where t.id = task_id and t.assignee_id = auth.uid())
  )
);

drop policy if exists "ptu_delete" on public.project_task_updates;
create policy "ptu_delete" on public.project_task_updates for delete to authenticated using (
  author_id = auth.uid() or public.has_role(auth.uid(),'super_admin')
);

-- ผู้รับมอบหมายต้องอัปเดตสถานะงานของตัวเองได้ (รับทราบ / ส่งมอบ / ความคืบหน้า)
drop policy if exists "ptask_assignee_update" on public.project_tasks;
create policy "ptask_assignee_update" on public.project_tasks for update to authenticated
  using (assignee_id = auth.uid())
  with check (assignee_id = auth.uid());
