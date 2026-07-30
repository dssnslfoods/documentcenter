-- 0014: งานผลิตภายใน (in-house) — ข้ามขั้นตอน RFQ / ใบเสนอราคา Supplier
alter table public.projects
  add column if not exists is_inhouse boolean not null default false;

comment on column public.projects.is_inhouse is
  'true = ผลิตภายใน ไม่ใช้ supplier/outsource (ข้ามเฟส RFQ และใบเสนอราคา Supplier)';
