-- 0050: บังคับใช้ "โหมดสนับสนุน" จริงในระดับฐานข้อมูล
-- ปัญหา: org_visible() เดิมให้ผู้ดูแลแพลตฟอร์มเห็นข้อมูลทุกองค์กรเมื่อ active_organization_id เป็น null
-- ทำให้แม้ผู้ดูแลองค์กร (super_admin) ปิดสิทธิ์สนับสนุนแล้ว ก็ยังเข้าถึงข้อมูลองค์กรนั้นได้อยู่
-- แก้: ผู้ดูแลแพลตฟอร์มจะเห็นข้อมูลขององค์กรใดได้ ก็ต่อเมื่อ
--   (1) เป็นองค์กรที่ตนสังกัดเอง หรือ
--   (2) องค์กรนั้นเปิดโหมดสนับสนุนอยู่ และตนสลับเข้าองค์กรนั้นแล้ว (active_organization_id = องค์กรนั้น)

create or replace function public.org_visible(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _org is null
      or _org = public.user_org(auth.uid())
      or (
        public.is_platform_owner()
        and _org = (select p.active_organization_id from public.profiles p where p.id = auth.uid())
        and public.support_access_active(_org)
      );
$$;

grant execute on function public.org_visible(uuid) to authenticated;

-- current_org_id: ถ้าองค์กรที่สลับเข้าไปถูกปิดสิทธิ์แล้ว ให้ถอยกลับไปองค์กรที่สังกัด
create or replace function public.current_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select case
           when p.active_organization_id is not null
                and public.support_access_active(p.active_organization_id)
             then p.active_organization_id
           else p.organization_id
         end
  from public.profiles p where p.id = auth.uid();
$$;

grant execute on function public.current_org_id() to authenticated;
