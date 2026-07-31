-- 0025: Align projects RLS with the UI permission model.
-- The app grants ผู้บริหาร (management) และ ผู้จัดการแผนก (dept_manager)
-- full project view/edit rights, but RLS only allowed super_admin / owner /
-- members with 'edit_project'. Result: the แก้ไข button was visible but the
-- UPDATE silently affected 0 rows.

create or replace function public.is_project_manager(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(_uid, 'super_admin')
      or public.has_role(_uid, 'management')
      or public.has_role(_uid, 'dept_manager')
$$;

drop policy if exists "prj_read" on public.projects;
drop policy if exists "prj_update" on public.projects;

create policy "prj_read" on public.projects for select to authenticated using (
  public.is_project_manager(auth.uid())
  or owner_id = auth.uid()
  or public.is_project_member(auth.uid(), id)
);

create policy "prj_update" on public.projects for update to authenticated using (
  public.is_project_manager(auth.uid())
  or owner_id = auth.uid()
  or public.has_project_permission(auth.uid(), id, 'edit_project')
) with check (
  public.is_project_manager(auth.uid())
  or owner_id = auth.uid()
  or public.has_project_permission(auth.uid(), id, 'edit_project')
);
