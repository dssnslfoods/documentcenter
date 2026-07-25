-- =====================================================================
-- Clear ALL mockup / transactional data — keep schema, auth users, and
-- master data that the app cannot function without (roles, settings).
--
-- Run this in Supabase SQL Editor when you are ready to test with real
-- data. Safe to run multiple times.
-- =====================================================================

do $$
declare
  -- Transactional / mockup tables to wipe (in any order — truncate cascade)
  tbls text[] := array[
    'project_milestones',
    'customer_quotations',
    'supplier_quotations',
    'project_documents',
    'project_spec_notes',
    'project_member_permissions',
    'project_members',
    'notifications',
    'contract_notes',
    'contract_attachments',
    'contract_milestones',
    'approvals',
    'document_versions',
    'audit_logs',
    'documents',
    'contracts',
    'quotations',
    'procurements',
    'projects',
    'partners',
    'departments',
    'document_categories',
    'work_types'
  ];
  t text;
begin
  foreach t in array tbls loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('truncate table public.%I restart identity cascade', t);
    end if;
  end loop;
end $$;

-- =====================================================================
-- Done. All mockup data cleared. auth.users, user_roles, permission_templates,
-- and system_settings are preserved so you can log in and configure the system.
-- =====================================================================
