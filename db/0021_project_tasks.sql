-- Project timeline / Gantt planning tasks
do $$ begin
  create type public.project_task_status as enum ('not_started','in_progress','done','blocked');
exception when duplicate_object then null; end $$;

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  parent_id uuid references public.project_tasks(id) on delete cascade,
  milestone_id uuid references public.project_milestones(id) on delete set null,
  assignee_id uuid references auth.users(id) on delete set null,
  name text not null,
  description text,
  start_date date not null default current_date,
  end_date date not null default current_date,
  progress smallint not null default 0 check (progress between 0 and 100),
  status public.project_task_status not null default 'not_started',
  is_milestone_marker boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ptask_project_idx on public.project_tasks(project_id);
create index if not exists ptask_parent_idx on public.project_tasks(parent_id);
create index if not exists ptask_dates_idx on public.project_tasks(start_date, end_date);

drop trigger if exists project_tasks_updated on public.project_tasks;
create trigger project_tasks_updated before update on public.project_tasks
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.project_tasks to authenticated;
grant all on public.project_tasks to service_role;

alter table public.project_tasks enable row level security;

drop policy if exists "ptask_read" on public.project_tasks;
create policy "ptask_read" on public.project_tasks for select to authenticated using (
  public.has_role(auth.uid(),'super_admin')
  or public.is_project_member(auth.uid(), project_id)
);

drop policy if exists "ptask_write" on public.project_tasks;
create policy "ptask_write" on public.project_tasks for all to authenticated
  using (
    public.has_role(auth.uid(),'super_admin')
    or public.has_project_permission(auth.uid(), project_id, 'edit_milestones')
  )
  with check (
    public.has_role(auth.uid(),'super_admin')
    or public.has_project_permission(auth.uid(), project_id, 'edit_milestones')
  );
