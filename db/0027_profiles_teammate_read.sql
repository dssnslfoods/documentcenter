-- อนุญาตให้สมาชิกโครงการเห็นชื่อ/อีเมลของสมาชิกคนอื่นในโครงการเดียวกัน

create or replace function public.shares_project(_a uuid, _b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members m1
    join public.project_members m2 on m1.project_id = m2.project_id
    where m1.user_id = _a and m2.user_id = _b
  )
$$;

drop policy if exists "profiles_teammate_read" on public.profiles;
create policy "profiles_teammate_read" on public.profiles
  for select to authenticated
  using (public.shares_project(auth.uid(), id));
