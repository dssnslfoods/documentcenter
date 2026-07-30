-- Link projects to partner master (customer)
alter table public.projects
  add column if not exists customer_id uuid references public.partners(id);

create index if not exists projects_customer_idx on public.projects(customer_id);
