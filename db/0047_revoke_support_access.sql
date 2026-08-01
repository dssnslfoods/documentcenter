-- 0047: ผู้ดูแลองค์กร (super_admin) ถอดสิทธิ์ผู้ดูแลแพลตฟอร์มได้ทันที
-- ปิดสิทธิ์สนับสนุน + เตะผู้ดูแลแพลตฟอร์มที่กำลังอยู่ในองค์กรนั้นออกจากโหมดสนับสนุน

create or replace function public.revoke_support_access(_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (
    public.has_role(auth.uid(), 'super_admin')
    and _org = public.user_org(auth.uid())
  ) then
    raise exception 'เฉพาะผู้ดูแลองค์กรเท่านั้นที่ถอดสิทธิ์สนับสนุนได้';
  end if;

  insert into public.organization_support_access (organization_id, enabled, granted_by, granted_at, expires_at, note, updated_at)
  values (_org, false, null, null, null, null, now())
  on conflict (organization_id) do update
    set enabled = false,
        granted_by = null,
        granted_at = null,
        expires_at = null,
        note = null,
        updated_at = now();

  -- ปิดเซสชันของผู้ดูแลแพลตฟอร์มที่กำลังเข้าใช้งานองค์กรนี้อยู่
  update public.profiles p
     set active_organization_id = null
   where p.active_organization_id = _org
     and exists (
       select 1 from public.user_roles r
       where r.user_id = p.id and r.role = 'platform_owner'
     );
end $$;

grant execute on function public.revoke_support_access(uuid) to authenticated;
