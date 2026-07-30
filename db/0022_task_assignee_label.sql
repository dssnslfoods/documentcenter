-- Allow tasks to be assigned to non-system parties (customer, supplier, consultant, ...)
alter table public.project_tasks
  add column if not exists assignee_label text;

comment on column public.project_tasks.assignee_label is
  'Free-form responsible party when the assignee is not an app user (e.g. ลูกค้า, คู่ค้า)';
