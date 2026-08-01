-- 0051: องค์กรต้องมีผู้ดูแลองค์กร (super_admin) อย่างน้อย 1 คนเสมอ
-- ป้องกันการถอดสิทธิ์คนสุดท้ายในระดับฐานข้อมูล (ต้องแต่งตั้งคนใหม่ก่อน)

create or replace function public.protect_last_super_admin()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _org uuid;
  _remaining int;
begin
  if old.role <> 'super_admin' then
    return coalesce(new, old);
  end if;
  -- ยังคงเป็น super_admin อยู่ (update ที่ไม่เปลี่ยนบทบาท) → ผ่าน
  if tg_op = 'UPDATE' and new.role = 'super_admin' then
    return new;
  end if;

  select organization_id into _org from public.profiles where id = old.user_id;
  if _org is null then
    return coalesce(new, old);
  end if;

  select count(*) into _remaining
    from public.user_roles r
    join public.profiles p on p.id = r.user_id
   where r.role = 'super_admin'
     and p.organization_id = _org
     and r.user_id <> old.user_id;

  if _remaining = 0 then
    raise exception 'องค์กรนี้ต้องมีผู้ดูแลองค์กร (super admin) อย่างน้อย 1 คน กรุณาแต่งตั้งผู้ดูแลคนใหม่ก่อนถอดสิทธิ์';
  end if;

  return coalesce(new, old);
end $$;

drop trigger if exists trg_protect_last_super_admin on public.user_roles;
create trigger trg_protect_last_super_admin
  before update or delete on public.user_roles
  for each row execute function public.protect_last_super_admin();
