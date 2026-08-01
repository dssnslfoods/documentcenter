-- 0042: remove the "viewer" application role
-- Existing viewer users are downgraded to "staff".

-- 1) migrate any existing viewer assignments to staff
update public.user_roles ur
set role = 'staff'
where role = 'viewer'
  and not exists (
    select 1 from public.user_roles u2
    where u2.user_id = ur.user_id and u2.role = 'staff'
  );

-- remove leftover viewer rows (user already had staff)
delete from public.user_roles where role = 'viewer';

-- 2) drop viewer page-access configuration
delete from public.role_page_access where role = 'viewer';
