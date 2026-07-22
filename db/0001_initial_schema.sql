-- =====================================================================
-- Corporate Document & Contract Hub — Initial Schema
-- Target: Supabase PostgreSQL (external project)
-- Run this file in Supabase SQL Editor on a fresh project.
-- =====================================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ---------- Enums ----------
create type public.app_role as enum ('super_admin','management','dept_manager','staff','viewer');
create type public.confidentiality_level as enum ('public','internal','confidential','highly_confidential');
create type public.document_status as enum ('draft','under_review','approved','active','expired','archived');
create type public.contract_status as enum ('draft','under_review','pending_approval','pending_signature','active','near_expiry','renewal_in_progress','expired','terminated','archived');
create type public.quotation_status as enum ('draft','submitted','under_review','negotiation','approved','rejected','won','lost','expired','converted_to_contract','converted_to_po');
create type public.quotation_type as enum ('incoming','outgoing');
create type public.procurement_status as enum ('draft','request_submitted','under_review','rfq','vendor_comparison','pending_approval','approved','contracting','in_progress','delivered','inspection_pending','completed','cancelled','overdue');
create type public.partner_type as enum ('customer','supplier','both');
create type public.partner_status as enum ('active','inactive','blocked');
create type public.approval_action_type as enum ('approve','reject','request_revision','cancel','delegate');

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- =====================================================================
-- 1) profiles / departments / user_roles
-- =====================================================================
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name_th text not null,
  name_en text,
  parent_id uuid references public.departments(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger departments_updated before update on public.departments for each row execute function public.set_updated_at();

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  position text,
  department_id uuid references public.departments(id) on delete set null,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create index profiles_dept_idx on public.profiles(department_id);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique(user_id, role)
);
create index user_roles_user_idx on public.user_roles(user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.current_user_dept()
returns uuid language sql stable security definer set search_path = public as $$
  select department_id from public.profiles where id = auth.uid()
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  insert into public.user_roles(user_id, role) values (new.id, 'staff') on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 2) Master data
-- =====================================================================
create table public.document_categories (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name_th text not null,
  name_en text,
  prefix text,
  parent_id uuid references public.document_categories(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger document_categories_updated before update on public.document_categories for each row execute function public.set_updated_at();

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  color text default 'gray',
  created_at timestamptz not null default now()
);

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  type public.partner_type not null default 'both',
  tax_id text,
  registration_no text,
  address text,
  phone text,
  email text,
  website text,
  business_type text,
  credit_terms text,
  bank_account text,
  status public.partner_status not null default 'active',
  rating numeric(3,1),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger partners_updated before update on public.partners for each row execute function public.set_updated_at();
create index partners_status_idx on public.partners(status);
create index partners_name_idx on public.partners(name);

create table public.partner_contacts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  name text not null,
  position text,
  phone text,
  email text,
  is_primary boolean default false,
  created_at timestamptz not null default now()
);
create index partner_contacts_partner_idx on public.partner_contacts(partner_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  department_id uuid references public.departments(id),
  owner_id uuid references auth.users(id),
  start_date date,
  end_date date,
  budget numeric(18,2),
  status text default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger projects_updated before update on public.projects for each row execute function public.set_updated_at();

-- =====================================================================
-- 3) Documents + files
-- =====================================================================
create table public.document_number_sequences (
  id uuid primary key default gen_random_uuid(),
  prefix text not null,
  year integer not null,
  last_number integer not null default 0,
  unique(prefix, year)
);

create or replace function public.next_document_no(_prefix text)
returns text language plpgsql security definer set search_path = public as $$
declare
  y int := extract(year from now())::int;
  n int;
begin
  insert into public.document_number_sequences(prefix, year, last_number)
    values (_prefix, y, 1)
    on conflict (prefix, year) do update set last_number = document_number_sequences.last_number + 1
    returning last_number into n;
  return _prefix || '-' || y || '-' || lpad(n::text, 4, '0');
end $$;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  document_no text unique,
  title text not null,
  description text,
  category_id uuid not null references public.document_categories(id),
  department_id uuid not null references public.departments(id),
  partner_id uuid references public.partners(id),
  project_id uuid references public.projects(id),
  owner_id uuid not null references auth.users(id),
  issue_date date,
  effective_date date,
  end_date date,
  renewal_date date,
  value_amount numeric(18,2) check (value_amount >= 0),
  currency text not null default 'THB',
  status public.document_status not null default 'draft',
  confidentiality public.confidentiality_level not null default 'internal',
  tags text[],
  keywords text,
  notes text,
  search_vector tsvector,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_end_after_effective check (end_date is null or effective_date is null or end_date >= effective_date)
);
create trigger documents_updated before update on public.documents for each row execute function public.set_updated_at();
create index documents_category_idx on public.documents(category_id);
create index documents_dept_idx on public.documents(department_id);
create index documents_partner_idx on public.documents(partner_id);
create index documents_status_idx on public.documents(status);
create index documents_end_date_idx on public.documents(end_date);
create index documents_search_idx on public.documents using gin(search_vector);

create or replace function public.documents_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare pfx text;
begin
  if new.document_no is null then
    select coalesce(prefix, 'DOC') into pfx from public.document_categories where id = new.category_id;
    new.document_no := public.next_document_no(pfx);
  end if;
  new.search_vector := to_tsvector('simple',
    coalesce(new.title,'') || ' ' || coalesce(new.description,'') || ' ' ||
    coalesce(new.keywords,'') || ' ' || coalesce(new.document_no,''));
  return new;
end $$;
create trigger documents_insert before insert on public.documents for each row execute function public.documents_before_insert();

create or replace function public.documents_before_update()
returns trigger language plpgsql as $$
begin
  new.search_vector := to_tsvector('simple',
    coalesce(new.title,'') || ' ' || coalesce(new.description,'') || ' ' ||
    coalesce(new.keywords,'') || ' ' || coalesce(new.document_no,''));
  return new;
end $$;
create trigger documents_before_update_tsv before update on public.documents for each row execute function public.documents_before_update();

create table public.document_files (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number integer not null,
  file_name text not null,
  file_size bigint,
  mime_type text,
  storage_path text not null,
  file_hash text,
  is_current boolean not null default true,
  uploaded_by uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  unique(document_id, version_number)
);
create index document_files_doc_idx on public.document_files(document_id);

-- =====================================================================
-- 4) Contracts / Quotations / Procurements
-- =====================================================================
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  contract_no text unique,
  title text not null,
  contract_type text,
  partner_id uuid not null references public.partners(id),
  department_id uuid not null references public.departments(id),
  owner_id uuid not null references auth.users(id),
  sign_date date,
  start_date date not null,
  end_date date not null,
  notice_days integer default 30,
  auto_renewal boolean default false,
  renewal_notice_date date,
  value_amount numeric(18,2) check (value_amount >= 0),
  currency text default 'THB',
  payment_terms text,
  guarantee_amount numeric(18,2),
  guarantee_expiry date,
  sla text,
  key_terms text,
  risk_notes text,
  status public.contract_status not null default 'draft',
  document_id uuid references public.documents(id),
  notes text,
  archived_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_contract_dates check (end_date >= start_date)
);
create trigger contracts_updated before update on public.contracts for each row execute function public.set_updated_at();
create index contracts_partner_idx on public.contracts(partner_id);
create index contracts_dept_idx on public.contracts(department_id);
create index contracts_end_idx on public.contracts(end_date);
create index contracts_status_idx on public.contracts(status);

create or replace function public.contracts_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.contract_no is null then new.contract_no := public.next_document_no('CON'); end if;
  return new;
end $$;
create trigger contracts_insert before insert on public.contracts for each row execute function public.contracts_before_insert();

create table public.contract_milestones (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  name text not null,
  due_date date,
  amount numeric(18,2),
  status text default 'pending',
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_no text unique,
  type public.quotation_type not null,
  partner_id uuid references public.partners(id),
  project_id uuid references public.projects(id),
  department_id uuid references public.departments(id),
  owner_id uuid references auth.users(id),
  title text not null,
  description text,
  issue_date date,
  expiry_date date,
  amount_before_tax numeric(18,2),
  discount numeric(18,2) default 0,
  tax numeric(18,2) default 0,
  total_amount numeric(18,2),
  currency text default 'THB',
  status public.quotation_status not null default 'draft',
  rejection_reason text,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger quotations_updated before update on public.quotations for each row execute function public.set_updated_at();
create index quotations_partner_idx on public.quotations(partner_id);
create index quotations_status_idx on public.quotations(status);

create or replace function public.quotations_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.quotation_no is null then new.quotation_no := public.next_document_no('QUO'); end if;
  return new;
end $$;
create trigger quotations_insert before insert on public.quotations for each row execute function public.quotations_before_insert();

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  description text not null,
  quantity numeric(18,3) not null default 1,
  unit_price numeric(18,2) not null default 0,
  amount numeric(18,2) generated always as (quantity * unit_price) stored,
  notes text
);

create table public.procurements (
  id uuid primary key default gen_random_uuid(),
  procurement_no text unique,
  title text not null,
  procurement_type text,
  department_id uuid not null references public.departments(id),
  requester_id uuid references auth.users(id),
  owner_id uuid references auth.users(id),
  project_id uuid references public.projects(id),
  budget numeric(18,2),
  estimated_value numeric(18,2),
  approved_value numeric(18,2),
  procurement_method text,
  supplier_id uuid references public.partners(id),
  request_date date,
  need_date date,
  approval_date date,
  award_date date,
  delivery_date date,
  inspection_date date,
  payment_due date,
  status public.procurement_status not null default 'draft',
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger procurements_updated before update on public.procurements for each row execute function public.set_updated_at();
create index procurements_status_idx on public.procurements(status);
create index procurements_dept_idx on public.procurements(department_id);

create or replace function public.procurements_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.procurement_no is null then new.procurement_no := public.next_document_no('PRC'); end if;
  return new;
end $$;
create trigger procurements_insert before insert on public.procurements for each row execute function public.procurements_before_insert();

create table public.procurement_vendors (
  id uuid primary key default gen_random_uuid(),
  procurement_id uuid not null references public.procurements(id) on delete cascade,
  partner_id uuid not null references public.partners(id),
  price numeric(18,2),
  delivery_days integer,
  payment_terms text,
  warranty text,
  sla text,
  technical_compliance text,
  vendor_score numeric(3,1),
  notes text,
  is_selected boolean default false,
  selection_reason text,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 5) Workflow, notifications, calendar, audit
-- =====================================================================
create table public.approval_workflows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  module text not null,
  is_active boolean default true,
  created_at timestamptz not null default now()
);

create table public.approval_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.approval_workflows(id) on delete cascade,
  step_order integer not null,
  name text not null,
  approver_role public.app_role,
  approver_id uuid references auth.users(id),
  is_final boolean default false
);

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references public.approval_workflows(id),
  module text not null,
  record_id uuid not null,
  current_step integer default 1,
  status text default 'pending',
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.approval_actions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.approval_requests(id) on delete cascade,
  step_order integer not null,
  action public.approval_action_type not null,
  actor_id uuid not null references auth.users(id),
  comment text,
  created_at timestamptz not null default now()
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_type text not null,
  event_date date not null,
  end_date date,
  module text,
  record_id uuid,
  department_id uuid references public.departments(id),
  owner_id uuid references auth.users(id),
  description text,
  created_at timestamptz not null default now()
);
create index calendar_date_idx on public.calendar_events(event_date);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.calendar_events(id) on delete cascade,
  module text,
  record_id uuid,
  remind_at timestamptz not null,
  days_before integer,
  sent_at timestamptz,
  channel text default 'in_app',
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  type text,
  link text,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, is_read);

create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references public.notifications(id),
  user_id uuid references auth.users(id),
  channel text,
  status text,
  error text,
  sent_at timestamptz default now()
);

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null,
  record_id uuid not null,
  created_at timestamptz not null default now(),
  unique(user_id, module, record_id)
);

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  module text not null,
  filters jsonb not null,
  created_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  record_id uuid not null,
  author_id uuid not null references auth.users(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index comments_record_idx on public.comments(module, record_id);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  action text not null,
  module text not null,
  record_id uuid,
  before_data jsonb,
  after_data jsonb,
  ip_address text,
  user_agent text,
  notes text,
  created_at timestamptz not null default now()
);
create index audit_logs_record_idx on public.audit_logs(module, record_id);
create index audit_logs_created_idx on public.audit_logs(created_at desc);

create table public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- GRANTS
-- =====================================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.profiles, public.user_roles, public.departments, public.document_categories, public.tags,
  public.partners, public.partner_contacts, public.projects,
  public.documents, public.document_files, public.document_number_sequences,
  public.contracts, public.contract_milestones,
  public.quotations, public.quotation_items,
  public.procurements, public.procurement_vendors,
  public.approval_workflows, public.approval_steps, public.approval_requests, public.approval_actions,
  public.calendar_events, public.reminders,
  public.notifications, public.notification_logs,
  public.favorites, public.saved_searches, public.comments,
  public.system_settings
to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role, authenticated;

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.user_roles enable row level security;
alter table public.document_categories enable row level security;
alter table public.tags enable row level security;
alter table public.partners enable row level security;
alter table public.partner_contacts enable row level security;
alter table public.projects enable row level security;
alter table public.documents enable row level security;
alter table public.document_files enable row level security;
alter table public.document_number_sequences enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_milestones enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.procurements enable row level security;
alter table public.procurement_vendors enable row level security;
alter table public.approval_workflows enable row level security;
alter table public.approval_steps enable row level security;
alter table public.approval_requests enable row level security;
alter table public.approval_actions enable row level security;
alter table public.calendar_events enable row level security;
alter table public.reminders enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_logs enable row level security;
alter table public.favorites enable row level security;
alter table public.saved_searches enable row level security;
alter table public.comments enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_settings enable row level security;

create policy "profiles_self_read" on public.profiles for select to authenticated using (id = auth.uid() or public.has_role(auth.uid(),'management') or public.has_role(auth.uid(),'super_admin'));
create policy "profiles_self_update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_admin_all" on public.profiles for all to authenticated using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));

create policy "user_roles_self_read" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'super_admin'));
create policy "user_roles_admin_all" on public.user_roles for all to authenticated using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));

create policy "dept_read" on public.departments for select to authenticated using (true);
create policy "dept_admin" on public.departments for all to authenticated using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));
create policy "cat_read" on public.document_categories for select to authenticated using (true);
create policy "cat_admin" on public.document_categories for all to authenticated using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));
create policy "tags_read" on public.tags for select to authenticated using (true);
create policy "tags_manage" on public.tags for all to authenticated using (true) with check (true);
create policy "partners_read" on public.partners for select to authenticated using (true);
create policy "partners_manage" on public.partners for all to authenticated using (true) with check (true);
create policy "pc_read" on public.partner_contacts for select to authenticated using (true);
create policy "pc_manage" on public.partner_contacts for all to authenticated using (true) with check (true);
create policy "prj_read" on public.projects for select to authenticated using (true);
create policy "prj_manage" on public.projects for all to authenticated using (true) with check (true);

create policy "documents_view" on public.documents for select to authenticated using (
  public.has_role(auth.uid(),'super_admin')
  or public.has_role(auth.uid(),'management')
  or department_id = public.current_user_dept()
  or owner_id = auth.uid()
);
create policy "documents_insert" on public.documents for insert to authenticated with check (
  owner_id = auth.uid() or public.has_role(auth.uid(),'super_admin')
);
create policy "documents_update" on public.documents for update to authenticated using (
  public.has_role(auth.uid(),'super_admin')
  or owner_id = auth.uid()
  or (department_id = public.current_user_dept() and public.has_role(auth.uid(),'dept_manager'))
) with check (true);
create policy "documents_delete_admin" on public.documents for delete to authenticated using (public.has_role(auth.uid(),'super_admin'));

create policy "document_files_view" on public.document_files for select to authenticated using (
  exists(select 1 from public.documents d where d.id = document_id and (
    public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'management')
    or d.department_id = public.current_user_dept() or d.owner_id = auth.uid()
  ))
);
create policy "document_files_insert" on public.document_files for insert to authenticated with check (
  exists(select 1 from public.documents d where d.id = document_id and (d.owner_id = auth.uid() or public.has_role(auth.uid(),'super_admin')))
);
create policy "document_files_update" on public.document_files for update to authenticated using (
  exists(select 1 from public.documents d where d.id = document_id and (d.owner_id = auth.uid() or public.has_role(auth.uid(),'super_admin')))
) with check (true);

create policy "seq_all_auth" on public.document_number_sequences for all to authenticated using (true) with check (true);

create policy "contracts_view" on public.contracts for select to authenticated using (
  public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'management')
  or department_id = public.current_user_dept() or owner_id = auth.uid()
);
create policy "contracts_write" on public.contracts for all to authenticated using (
  public.has_role(auth.uid(),'super_admin') or owner_id = auth.uid()
  or (department_id = public.current_user_dept() and public.has_role(auth.uid(),'dept_manager'))
) with check (true);

create policy "cm_view" on public.contract_milestones for select to authenticated using (
  exists(select 1 from public.contracts c where c.id = contract_id)
);
create policy "cm_write" on public.contract_milestones for all to authenticated using (true) with check (true);

create policy "quotations_view" on public.quotations for select to authenticated using (
  public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'management')
  or department_id = public.current_user_dept() or owner_id = auth.uid()
);
create policy "quotations_write" on public.quotations for all to authenticated using (
  public.has_role(auth.uid(),'super_admin') or owner_id = auth.uid()
  or (department_id = public.current_user_dept() and public.has_role(auth.uid(),'dept_manager'))
) with check (true);
create policy "qi_view" on public.quotation_items for select to authenticated using (true);
create policy "qi_write" on public.quotation_items for all to authenticated using (true) with check (true);

create policy "procurements_view" on public.procurements for select to authenticated using (
  public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'management')
  or department_id = public.current_user_dept() or owner_id = auth.uid() or requester_id = auth.uid()
);
create policy "procurements_write" on public.procurements for all to authenticated using (
  public.has_role(auth.uid(),'super_admin') or owner_id = auth.uid() or requester_id = auth.uid()
  or (department_id = public.current_user_dept() and public.has_role(auth.uid(),'dept_manager'))
) with check (true);
create policy "pv_view" on public.procurement_vendors for select to authenticated using (true);
create policy "pv_write" on public.procurement_vendors for all to authenticated using (true) with check (true);

create policy "wf_read" on public.approval_workflows for select to authenticated using (true);
create policy "wf_admin" on public.approval_workflows for all to authenticated using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));
create policy "ws_read" on public.approval_steps for select to authenticated using (true);
create policy "ws_admin" on public.approval_steps for all to authenticated using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));
create policy "ar_view" on public.approval_requests for select to authenticated using (submitted_by = auth.uid() or public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'management'));
create policy "ar_write" on public.approval_requests for all to authenticated using (true) with check (true);
create policy "aa_view" on public.approval_actions for select to authenticated using (true);
create policy "aa_write" on public.approval_actions for insert to authenticated with check (actor_id = auth.uid());

create policy "cal_view" on public.calendar_events for select to authenticated using (true);
create policy "cal_write" on public.calendar_events for all to authenticated using (true) with check (true);
create policy "rem_view" on public.reminders for select to authenticated using (true);
create policy "rem_write" on public.reminders for all to authenticated using (true) with check (true);

create policy "notif_self_view" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notif_self_update" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notif_insert" on public.notifications for insert to authenticated with check (true);
create policy "notif_log_read" on public.notification_logs for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'super_admin'));

create policy "fav_self" on public.favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ss_self" on public.saved_searches for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "com_view" on public.comments for select to authenticated using (true);
create policy "com_write" on public.comments for insert to authenticated with check (author_id = auth.uid());

create policy "audit_insert" on public.audit_logs for insert to authenticated with check (user_id = auth.uid() or user_id is null);
create policy "audit_read" on public.audit_logs for select to authenticated using (
  public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'management')
);

create policy "sys_read" on public.system_settings for select to authenticated using (true);
create policy "sys_admin" on public.system_settings for all to authenticated using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));

-- =====================================================================
-- STORAGE: documents bucket
-- =====================================================================
insert into storage.buckets (id, name, public) values ('documents','documents', false)
on conflict (id) do nothing;

create policy "docs_bucket_read" on storage.objects for select to authenticated using (
  bucket_id = 'documents' and (
    public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'management') or
    exists(
      select 1 from public.document_files df
      join public.documents d on d.id = df.document_id
      where df.storage_path = storage.objects.name
        and (d.department_id = public.current_user_dept() or d.owner_id = auth.uid())
    )
  )
);
create policy "docs_bucket_insert" on storage.objects for insert to authenticated with check (bucket_id = 'documents');
create policy "docs_bucket_update" on storage.objects for update to authenticated using (bucket_id = 'documents' and public.has_role(auth.uid(),'super_admin'));
create policy "docs_bucket_delete" on storage.objects for delete to authenticated using (bucket_id = 'documents' and public.has_role(auth.uid(),'super_admin'));
