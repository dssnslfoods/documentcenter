-- Project edit history: records every change made to a project row
create table if not exists public.project_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  changed_by uuid references auth.users(id),
  action text not null default 'update',
  changes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists project_history_project_idx
  on public.project_history(project_id, created_at desc);

grant select, insert on public.project_history to authenticated;
grant all on public.project_history to service_role;

alter table public.project_history enable row level security;

drop policy if exists "ph_read" on public.project_history;
create policy "ph_read" on public.project_history for select to authenticated using (
  public.has_role(auth.uid(),'super_admin')
  or public.has_role(auth.uid(),'management')
  or public.is_project_member(auth.uid(), project_id)
);

drop policy if exists "ph_insert" on public.project_history;
create policy "ph_insert" on public.project_history for insert to authenticated with check (true);

-- Automatically capture field-level diffs on update / insert
create or replace function public.projects_track_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  diffs jsonb := '[]'::jsonb;
  k text;
  old_j jsonb;
  new_j jsonb;
  skip_keys text[] := array['updated_at','updated_by','created_at','created_by','id'];
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
      diffs := diffs || jsonb_build_object(
        'field', k,
        'old', old_j -> k,
        'new', new_j -> k
      );
    end if;
  end loop;

  if jsonb_array_length(diffs) > 0 then
    insert into public.project_history(project_id, changed_by, action, changes)
    values (new.id, coalesce(new.updated_by, auth.uid()), 'update', diffs);
  end if;

  return new;
end $$;

drop trigger if exists projects_history_trg on public.projects;
create trigger projects_history_trg
  after insert or update on public.projects
  for each row execute function public.projects_track_history();
