-- Retire standalone Procurement module; move vendor selection into projects
-- via supplier_quotations.version + is_selected (one selected per project).

alter table public.supplier_quotations
  add column if not exists version smallint not null default 1,
  add column if not exists is_selected boolean not null default false;

-- Only one selected supplier quotation per project.
create unique index if not exists sq_one_selected_per_project
  on public.supplier_quotations(project_id)
  where is_selected;

create index if not exists sq_project_supplier_idx
  on public.supplier_quotations(project_id, supplier_id);
