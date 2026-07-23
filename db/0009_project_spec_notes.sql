-- Free-form RFQ/Spec notes per project
create table if not exists public.project_spec_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  note_type text not null default 'rfq_spec' check (note_type in ('rfq_spec','tor','other')),
  title text not null,
  content text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists psn_project_idx on public.project_spec_notes(project_id);
create index if not exists psn_type_idx on public.project_spec_notes(note_type);

grant select, insert, update, delete on public.project_spec_notes to authenticated;
grant all on public.project_spec_notes to service_role;
alter table public.project_spec_notes enable row level security;

create policy "psn_read" on public.project_spec_notes for select to authenticated using (
  public.has_role(auth.uid(),'super_admin')
  or public.is_project_member(auth.uid(), project_id)
);
create policy "psn_write" on public.project_spec_notes for all to authenticated
  using (
    public.has_role(auth.uid(),'super_admin')
    or public.has_project_permission(auth.uid(), project_id, 'upload_documents')
  )
  with check (
    public.has_role(auth.uid(),'super_admin')
    or public.has_project_permission(auth.uid(), project_id, 'upload_documents')
  );

create or replace function public.touch_project_spec_notes() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_psn_touch on public.project_spec_notes;
create trigger trg_psn_touch before update on public.project_spec_notes
for each row execute function public.touch_project_spec_notes();
