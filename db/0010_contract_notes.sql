-- Free-form contract notes (for full-text search / reference)
create table if not exists public.contract_notes (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  note_type text not null default 'general' check (note_type in ('general','clause','obligation','risk','other')),
  title text not null,
  content text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cn_contract_idx on public.contract_notes(contract_id);
create index if not exists cn_type_idx on public.contract_notes(note_type);
-- Full-text search (simple config; works with Thai copy-paste too)
create index if not exists cn_content_fts on public.contract_notes
  using gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,'')));

grant select, insert, update, delete on public.contract_notes to authenticated;
grant all on public.contract_notes to service_role;
alter table public.contract_notes enable row level security;

create policy "cn_view" on public.contract_notes for select to authenticated using (
  exists(
    select 1 from public.contracts c
    where c.id = contract_id and (
      public.has_role(auth.uid(),'super_admin')
      or public.has_role(auth.uid(),'management')
      or c.department_id = public.current_user_dept()
      or c.owner_id = auth.uid()
    )
  )
);

create policy "cn_write" on public.contract_notes for all to authenticated
  using (
    exists(
      select 1 from public.contracts c
      where c.id = contract_id and (
        public.has_role(auth.uid(),'super_admin')
        or c.owner_id = auth.uid()
        or (c.department_id = public.current_user_dept() and public.has_role(auth.uid(),'dept_manager'))
      )
    )
  )
  with check (
    exists(
      select 1 from public.contracts c
      where c.id = contract_id and (
        public.has_role(auth.uid(),'super_admin')
        or c.owner_id = auth.uid()
        or (c.department_id = public.current_user_dept() and public.has_role(auth.uid(),'dept_manager'))
      )
    )
  );

create or replace function public.touch_contract_notes() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_cn_touch on public.contract_notes;
create trigger trg_cn_touch before update on public.contract_notes
for each row execute function public.touch_contract_notes();
