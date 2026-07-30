-- Add deliverable details (รายละเอียดการส่งมอบ) to project milestones
alter table public.project_milestones
  add column if not exists deliverable_details text;
