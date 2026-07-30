-- Allow any authenticated user to add new work types (master data) inline from forms.
grant insert on public.work_types to authenticated;

drop policy if exists work_types_insert_authenticated on public.work_types;
create policy work_types_insert_authenticated on public.work_types
  for insert to authenticated
  with check (true);
