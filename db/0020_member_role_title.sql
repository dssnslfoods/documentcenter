-- Role title and responsibilities for project members
alter table public.project_members
  add column if not exists role_title text,
  add column if not exists responsibilities text;
