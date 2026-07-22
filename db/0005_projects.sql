-- Projects module: auto-numbering + progress field
alter table public.projects
  add column if not exists progress smallint not null default 0 check (progress between 0 and 100),
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists archived_at timestamptz;

alter table public.projects alter column code drop not null;

create or replace function public.projects_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.code is null or new.code = '' then
    new.code := public.next_document_no('PRJ');
  end if;
  return new;
end $$;

drop trigger if exists projects_insert on public.projects;
create trigger projects_insert before insert on public.projects
  for each row execute function public.projects_before_insert();

create index if not exists projects_status_idx on public.projects(status);
create index if not exists projects_dept_idx on public.projects(department_id);
