-- 0057: ปิดช่องโหว่ด้านความปลอดภัยที่พบระหว่าง UAT
--
-- 1) ผู้ใช้ที่ถูกปิดใช้งาน (profiles.is_active = false) ยังมีสิทธิ์ตามบทบาทใน DB
--    → has_role / is_project_member / project_role_of ต้องเช็กว่าผู้ใช้ยัง active
-- 2) super_admin เพิ่มบทบาท platform_owner ให้ตัวเองได้ (trigger เดิมกันแค่ UPDATE/DELETE)
-- 3) ผู้ใช้แก้ organization_id / is_active / active_organization_id ของตัวเองได้
--    (ย้ายตัวเองไปองค์กรอื่น หรือเปิดบัญชีที่ถูกปิดกลับมา)
-- 4) สมัครสมาชิกเองแล้วเข้าองค์กร ORG001 เป็น staff ทันที และเชื่อ organization_id จาก metadata ที่ผู้ใช้ส่งมาเอง
--    → ผู้ใช้ใหม่ไม่มีองค์กรและไม่มีบทบาท จนกว่าผู้ดูแลจะเพิ่มเข้าองค์กร
-- 5) ผู้ใช้ทุกคนสร้าง notification ให้ใครก็ได้ (policy with check true)
-- 6) anon (ไม่ต้อง login) เรียก SECURITY DEFINER function ได้ทั้ง 44 ตัว เช่น create_notification

-- ---------------------------------------------------------------------------
-- 1) ผู้ใช้ที่ปิดใช้งานไม่มีสิทธิ์ใดๆ
create or replace function public.is_user_active(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_active from public.profiles p where p.id = _uid), false)
$$;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_user_active(_user_id)
     and exists (
       select 1 from public.user_roles
       where user_id = _user_id and (role = _role or role = 'platform_owner')
     );
$$;

create or replace function public.is_platform_owner(_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_user_active(_uid)
     and exists (select 1 from public.user_roles where user_id = _uid and role = 'platform_owner');
$$;

create or replace function public.is_project_member(_user_id uuid, _project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_user_active(_user_id)
     and exists (
       select 1 from public.project_members
       where project_id = _project_id and user_id = _user_id
     )
$$;

create or replace function public.project_role_of(_user_id uuid, _project_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.is_user_active(_user_id) then null
    when public.has_role(_user_id,'super_admin') or public.has_role(_user_id,'management') then
      coalesce((select m.project_role from public.project_members m
                where m.project_id = _project_id and m.user_id = _user_id), 'exec')
    else (select m.project_role from public.project_members m
          where m.project_id = _project_id and m.user_id = _user_id)
  end
$$;

-- ---------------------------------------------------------------------------
-- 2) เฉพาะ platform_owner เท่านั้นที่มอบบทบาท platform_owner ได้
create or replace function public.protect_platform_owner_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() เป็น null = service role / SQL Editor → อนุญาต
  if auth.uid() is not null then
    if (tg_op = 'DELETE' and old.role = 'platform_owner')
       or (tg_op = 'UPDATE' and old.role = 'platform_owner' and new.role is distinct from old.role) then
      if not public.is_platform_owner() then
        raise exception 'ไม่สามารถถอดสิทธิ์ผู้ดูแลแพลตฟอร์มได้';
      end if;
    end if;

    if (tg_op = 'INSERT' and new.role = 'platform_owner')
       or (tg_op = 'UPDATE' and new.role = 'platform_owner' and old.role is distinct from new.role) then
      if not public.is_platform_owner() then
        raise exception 'เฉพาะผู้ดูแลแพลตฟอร์มเท่านั้นที่มอบสิทธิ์ผู้ดูแลแพลตฟอร์มได้';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists trg_protect_platform_owner on public.user_roles;
create trigger trg_protect_platform_owner
before insert or update or delete on public.user_roles
for each row execute function public.protect_platform_owner_role();

-- ---------------------------------------------------------------------------
-- 3) ฟิลด์สิทธิ์ใน profiles แก้ได้เฉพาะผู้ดูแล
create or replace function public.guard_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller uuid := auth.uid();
begin
  if _caller is null then
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id then
    if public.is_platform_owner() then
      null;
    -- ผู้ดูแลองค์กรรับผู้ใช้ที่ยังไม่มีองค์กร เข้าองค์กรของตัวเองได้
    elsif old.organization_id is null
          and new.organization_id = public.user_org(_caller)
          and public.has_role(_caller, 'super_admin') then
      null;
    else
      raise exception 'ไม่มีสิทธิ์เปลี่ยนองค์กรของผู้ใช้';
    end if;
  end if;

  if new.is_active is distinct from old.is_active
     and not public.has_role(_caller, 'super_admin') then
    raise exception 'ไม่มีสิทธิ์เปลี่ยนสถานะการใช้งานของผู้ใช้';
  end if;

  if new.active_organization_id is distinct from old.active_organization_id
     and not public.is_platform_owner() then
    raise exception 'เฉพาะผู้ดูแลแพลตฟอร์มเท่านั้นที่สลับองค์กรได้';
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_profile_privileged_fields on public.profiles;
create trigger trg_guard_profile_privileged_fields
before update on public.profiles
for each row execute function public.guard_profile_privileged_fields();

-- ---------------------------------------------------------------------------
-- 4) ผู้ใช้ใหม่: ไม่เชื่อ organization_id จาก metadata ที่ผู้ใช้ส่งเอง และไม่ให้บทบาทอัตโนมัติ
--    ผู้ดูแลเป็นผู้กำหนดองค์กรและบทบาทหลังสร้างบัญชี (settings/users, platform/admins)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 5) notification สร้างให้ตัวเองได้เท่านั้น (ระบบสร้างผ่าน trigger / security definer)
drop policy if exists "notif_insert" on public.notifications;
create policy "notif_insert" on public.notifications
for insert to authenticated
with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6) ปิดการเรียก SECURITY DEFINER function จาก anon
--    และฟังก์ชันที่ใช้ภายในระบบเท่านั้นห้าม authenticated เรียกผ่าน API
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', r.fn);
    execute format('grant execute on function %s to authenticated, service_role', r.fn);
  end loop;
end $$;

revoke execute on function public.create_notification(uuid, text, text, text, text) from authenticated;
revoke execute on function public.scan_due_date_notifications() from authenticated;
revoke execute on function public.scan_assignment_due_notifications() from authenticated;
revoke execute on function public.update_project_health(uuid) from authenticated;
