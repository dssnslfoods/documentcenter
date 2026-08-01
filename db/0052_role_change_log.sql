-- 0052: บันทึกประวัติการเปลี่ยน/ถอดสิทธิ์บทบาทผู้ใช้ (Role change log)
-- ใช้สำหรับตรวจสอบย้อนหลัง และ "กู้คืนสิทธิ์" (restore) ที่หน้าผู้ดูแลองค์กร

create table if not exists public.role_change_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  action text not null check (action in ('granted', 'revoked')),
  actor_id uuid references auth.users(id) on delete set null,
  restored_at timestamptz,
  restored_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_role_change_log_org on public.role_change_log(organization_id, created_at desc);
create index if not exists idx_role_change_log_user on public.role_change_log(user_id, created_at desc);

grant select, insert, update on public.role_change_log to authenticated;
grant all on public.role_change_log to service_role;

alter table public.role_change_log enable row level security;

drop policy if exists role_change_log_select on public.role_change_log;
create policy role_change_log_select on public.role_change_log
  for select to authenticated
  using (
    public.is_platform_owner()
    or (
      public.has_role(auth.uid(), 'super_admin')
      and organization_id = public.user_org(auth.uid())
    )
  );

-- เขียนผ่าน trigger (security definer) เป็นหลัก แต่อนุญาตให้ผู้ดูแลอัปเดตสถานะกู้คืนได้
drop policy if exists role_change_log_insert on public.role_change_log;
create policy role_change_log_insert on public.role_change_log
  for insert to authenticated
  with check (
    public.is_platform_owner()
    or public.has_role(auth.uid(), 'super_admin')
  );

drop policy if exists role_change_log_update on public.role_change_log;
create policy role_change_log_update on public.role_change_log
  for update to authenticated
  using (
    public.is_platform_owner()
    or (
      public.has_role(auth.uid(), 'super_admin')
      and organization_id = public.user_org(auth.uid())
    )
  )
  with check (true);

-- ---------------------------------------------------------------- trigger
create or replace function public.log_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _uid uuid;
  _role public.app_role;
  _action text;
begin
  if tg_op = 'INSERT' then
    _uid := new.user_id; _role := new.role; _action := 'granted';
  elsif tg_op = 'DELETE' then
    _uid := old.user_id; _role := old.role; _action := 'revoked';
  else
    if new.role = old.role then
      return new;
    end if;
    insert into public.role_change_log (organization_id, user_id, role, action, actor_id)
    values ((select organization_id from public.profiles where id = old.user_id), old.user_id, old.role, 'revoked', auth.uid());
    insert into public.role_change_log (organization_id, user_id, role, action, actor_id)
    values ((select organization_id from public.profiles where id = new.user_id), new.user_id, new.role, 'granted', auth.uid());
    return new;
  end if;

  insert into public.role_change_log (organization_id, user_id, role, action, actor_id)
  values ((select organization_id from public.profiles where id = _uid), _uid, _role, _action, auth.uid());

  return coalesce(new, old);
end $$;

drop trigger if exists trg_log_role_change on public.user_roles;
create trigger trg_log_role_change
  after insert or update or delete on public.user_roles
  for each row execute function public.log_role_change();
