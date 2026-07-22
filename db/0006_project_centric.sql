-- =====================================================================
-- Milestone A — Project-Centric rework: schema, RLS, storage
-- Run once in Supabase SQL Editor after 0001..0005.
-- =====================================================================

-- ---------- 1) Extend projects ----------
alter table public.projects
  add column if not exists customer_name text,
  add column if not exists project_type text,
  add column if not exists contract_value numeric(18,2),
  add column if not exists lost_reason text,
  add column if not exists completion_comment text;

-- projects.status is a text column already; normalize legacy values
update public.projects set status = 'draft' where status in ('planning', null) or status is null;
update public.projects set status = 'in_progress' where status = 'active';

-- Constrain to the new lifecycle values
alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects
  add constraint projects_status_check check (status in (
    'draft','rfq_sent','quotation_received','proposal_submitted',
    'won','lost','in_progress','completed'
  ));

-- ---------- 2) Project members ----------
create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(project_id, user_id)
);
create index if not exists project_members_project_idx on public.project_members(project_id);
create index if not exists project_members_user_idx on public.project_members(user_id);

grant select, insert, update, delete on public.project_members to authenticated;
grant all on public.project_members to service_role;
alter table public.project_members enable row level security;

-- Helper: is caller a project member?
create or replace function public.is_project_member(_user_id uuid, _project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.project_members
    where project_id = _project_id and user_id = _user_id
  )
$$;

create policy "pm_read" on public.project_members for select to authenticated using (
  user_id = auth.uid()
  or public.has_role(auth.uid(),'super_admin')
  or public.is_project_member(auth.uid(), project_id)
);
create policy "pm_admin_all" on public.project_members for all to authenticated
  using (public.has_role(auth.uid(),'super_admin'))
  with check (public.has_role(auth.uid(),'super_admin'));

-- ---------- 3) Per-member permission tick rows ----------
create table if not exists public.project_member_permissions (
  id uuid primary key default gen_random_uuid(),
  project_member_id uuid not null references public.project_members(id) on delete cascade,
  permission_key text not null,
  granted boolean not null default true,
  updated_at timestamptz not null default now(),
  unique(project_member_id, permission_key)
);
create index if not exists pmp_member_idx on public.project_member_permissions(project_member_id);

grant select, insert, update, delete on public.project_member_permissions to authenticated;
grant all on public.project_member_permissions to service_role;
alter table public.project_member_permissions enable row level security;

create policy "pmp_read" on public.project_member_permissions for select to authenticated using (
  public.has_role(auth.uid(),'super_admin')
  or exists(select 1 from public.project_members m where m.id = project_member_id and m.user_id = auth.uid())
);
create policy "pmp_admin_all" on public.project_member_permissions for all to authenticated
  using (public.has_role(auth.uid(),'super_admin'))
  with check (public.has_role(auth.uid(),'super_admin'));

-- Helper: does caller have a specific permission on a project?
create or replace function public.has_project_permission(_user_id uuid, _project_id uuid, _key text)
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.has_role(_user_id, 'super_admin')
    or exists(
      select 1
      from public.project_members m
      join public.project_member_permissions p on p.project_member_id = m.id
      where m.project_id = _project_id
        and m.user_id = _user_id
        and p.permission_key = _key
        and p.granted = true
    )
$$;

-- ---------- 4) Permission templates ----------
create table if not exists public.permission_templates (
  id uuid primary key default gen_random_uuid(),
  template_name text not null unique,
  permissions jsonb not null default '[]'::jsonb,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

grant select on public.permission_templates to authenticated;
grant all on public.permission_templates to service_role;
alter table public.permission_templates enable row level security;

create policy "tpl_read" on public.permission_templates for select to authenticated using (true);
create policy "tpl_admin" on public.permission_templates for all to authenticated
  using (public.has_role(auth.uid(),'super_admin'))
  with check (public.has_role(auth.uid(),'super_admin'));

insert into public.permission_templates (template_name, permissions, is_system) values
  ('Full Access', to_jsonb(array[
    'view_project_info','view_spec_scope','view_supplier_quotation','view_customer_quotation',
    'view_contract','view_milestones','view_all_documents',
    'edit_project','edit_milestones','upload_documents'
  ]), true),
  ('View Only (with Price)', to_jsonb(array[
    'view_project_info','view_spec_scope','view_supplier_quotation','view_customer_quotation',
    'view_contract','view_milestones','view_all_documents'
  ]), true),
  ('View Only (no Price)', to_jsonb(array[
    'view_project_info','view_spec_scope','view_supplier_quotation_no_price',
    'view_customer_quotation_no_price','view_contract','view_milestones_no_payment','view_all_documents'
  ]), true),
  ('Scope Only', to_jsonb(array[
    'view_project_info','view_spec_scope'
  ]), true)
on conflict (template_name) do nothing;

-- ---------- 5) Supplier quotations ----------
create table if not exists public.supplier_quotations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  supplier_id uuid references public.partners(id),
  supplier_name text,
  quotation_amount numeric(18,2),
  received_date date,
  notes text,
  file_urls text[] not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists sq_project_idx on public.supplier_quotations(project_id);

grant select, insert, update, delete on public.supplier_quotations to authenticated;
grant all on public.supplier_quotations to service_role;
alter table public.supplier_quotations enable row level security;

create policy "sq_read" on public.supplier_quotations for select to authenticated using (
  public.has_role(auth.uid(),'super_admin')
  or public.is_project_member(auth.uid(), project_id)
);
create policy "sq_write" on public.supplier_quotations for all to authenticated
  using (
    public.has_role(auth.uid(),'super_admin')
    or public.has_project_permission(auth.uid(), project_id, 'upload_documents')
  )
  with check (
    public.has_role(auth.uid(),'super_admin')
    or public.has_project_permission(auth.uid(), project_id, 'upload_documents')
  );

-- ---------- 6) Customer quotations ----------
create table if not exists public.customer_quotations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  quotation_amount numeric(18,2),
  submitted_date date,
  notes text,
  file_url text,
  is_final boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists cq_project_idx on public.customer_quotations(project_id);

grant select, insert, update, delete on public.customer_quotations to authenticated;
grant all on public.customer_quotations to service_role;
alter table public.customer_quotations enable row level security;

create policy "cq_read" on public.customer_quotations for select to authenticated using (
  public.has_role(auth.uid(),'super_admin')
  or public.is_project_member(auth.uid(), project_id)
);
create policy "cq_write" on public.customer_quotations for all to authenticated
  using (
    public.has_role(auth.uid(),'super_admin')
    or public.has_project_permission(auth.uid(), project_id, 'upload_documents')
  )
  with check (
    public.has_role(auth.uid(),'super_admin')
    or public.has_project_permission(auth.uid(), project_id, 'upload_documents')
  );

-- ---------- 7) Project documents (typed uploads) ----------
do $$ begin
  create type public.project_document_type as enum ('rfq_spec','tor','contract','final_quotation','other');
exception when duplicate_object then null; end $$;

create table if not exists public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  document_type public.project_document_type not null default 'other',
  document_name text not null,
  file_url text not null,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now()
);
create index if not exists pd_project_idx on public.project_documents(project_id);
create index if not exists pd_type_idx on public.project_documents(document_type);

grant select, insert, update, delete on public.project_documents to authenticated;
grant all on public.project_documents to service_role;
alter table public.project_documents enable row level security;

create policy "pd_read" on public.project_documents for select to authenticated using (
  public.has_role(auth.uid(),'super_admin')
  or public.is_project_member(auth.uid(), project_id)
);
create policy "pd_write" on public.project_documents for all to authenticated
  using (
    public.has_role(auth.uid(),'super_admin')
    or public.has_project_permission(auth.uid(), project_id, 'upload_documents')
  )
  with check (
    public.has_role(auth.uid(),'super_admin')
    or public.has_project_permission(auth.uid(), project_id, 'upload_documents')
  );

-- ---------- 8) Project milestones (independent of contract_milestones) ----------
do $$ begin
  create type public.project_milestone_status as enum ('pending','completed','postponed','failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.project_milestone_payment_type as enum ('percentage','fixed_amount');
exception when duplicate_object then null; end $$;

create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  milestone_number integer not null default 1,
  description text not null,
  due_date date,
  payment_type public.project_milestone_payment_type not null default 'percentage',
  payment_value numeric(18,2) not null default 0,
  status public.project_milestone_status not null default 'pending',
  actual_completion_date date,
  postponed_to_date date,
  status_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pm_project_idx on public.project_milestones(project_id);
create index if not exists pm_status_idx on public.project_milestones(status);
create index if not exists pm_due_idx on public.project_milestones(due_date);
create trigger project_milestones_updated before update on public.project_milestones
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.project_milestones to authenticated;
grant all on public.project_milestones to service_role;
alter table public.project_milestones enable row level security;

create policy "pmil_read" on public.project_milestones for select to authenticated using (
  public.has_role(auth.uid(),'super_admin')
  or public.is_project_member(auth.uid(), project_id)
);
create policy "pmil_write" on public.project_milestones for all to authenticated
  using (
    public.has_role(auth.uid(),'super_admin')
    or public.has_project_permission(auth.uid(), project_id, 'edit_milestones')
  )
  with check (
    public.has_role(auth.uid(),'super_admin')
    or public.has_project_permission(auth.uid(), project_id, 'edit_milestones')
  );

-- ---------- 9) Tighten projects RLS to membership ----------
drop policy if exists "prj_read" on public.projects;
drop policy if exists "prj_manage" on public.projects;

create policy "prj_read" on public.projects for select to authenticated using (
  public.has_role(auth.uid(),'super_admin')
  or owner_id = auth.uid()
  or public.is_project_member(auth.uid(), id)
);
create policy "prj_insert" on public.projects for insert to authenticated
  with check (auth.uid() is not null);
create policy "prj_update" on public.projects for update to authenticated using (
  public.has_role(auth.uid(),'super_admin')
  or owner_id = auth.uid()
  or public.has_project_permission(auth.uid(), id, 'edit_project')
) with check (
  public.has_role(auth.uid(),'super_admin')
  or owner_id = auth.uid()
  or public.has_project_permission(auth.uid(), id, 'edit_project')
);
create policy "prj_delete_admin" on public.projects for delete to authenticated using (
  public.has_role(auth.uid(),'super_admin')
);

-- Auto-add owner as project member with Full Access on insert
create or replace function public.projects_after_insert_owner_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  member_id uuid;
  perm_key text;
  full_perms text[] := array[
    'view_project_info','view_spec_scope','view_supplier_quotation','view_customer_quotation',
    'view_contract','view_milestones','view_all_documents',
    'edit_project','edit_milestones','upload_documents'
  ];
begin
  if new.owner_id is null then
    return new;
  end if;
  insert into public.project_members(project_id, user_id, added_by)
  values (new.id, new.owner_id, new.owner_id)
  on conflict do nothing
  returning id into member_id;

  if member_id is null then
    select id into member_id from public.project_members
      where project_id = new.id and user_id = new.owner_id;
  end if;

  foreach perm_key in array full_perms loop
    insert into public.project_member_permissions(project_member_id, permission_key, granted)
    values (member_id, perm_key, true)
    on conflict do nothing;
  end loop;

  return new;
end $$;

drop trigger if exists projects_owner_member on public.projects;
create trigger projects_owner_member after insert on public.projects
  for each row execute function public.projects_after_insert_owner_member();

-- ---------- 10) Storage bucket for project files ----------
insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;

drop policy if exists "project_files_read" on storage.objects;
create policy "project_files_read" on storage.objects for select to authenticated using (
  bucket_id = 'project-files' and (
    public.has_role(auth.uid(),'super_admin')
    or public.is_project_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  )
);

drop policy if exists "project_files_write" on storage.objects;
create policy "project_files_write" on storage.objects for insert to authenticated with check (
  bucket_id = 'project-files' and (
    public.has_role(auth.uid(),'super_admin')
    or public.has_project_permission(auth.uid(), (split_part(name, '/', 1))::uuid, 'upload_documents')
  )
);

drop policy if exists "project_files_delete" on storage.objects;
create policy "project_files_delete" on storage.objects for delete to authenticated using (
  bucket_id = 'project-files' and (
    public.has_role(auth.uid(),'super_admin')
    or public.has_project_permission(auth.uid(), (split_part(name, '/', 1))::uuid, 'upload_documents')
  )
);
