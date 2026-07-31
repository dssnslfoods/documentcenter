-- อนุญาตให้โครงการหนึ่งมีใบเสนอราคาจาก Supplier ที่เป็น Final ได้มากกว่า 1 รายการ
drop index if exists public.sq_one_selected_per_project;

-- ยังคงค้นหาเร็วด้วย index ปกติ (ไม่ unique)
create index if not exists sq_selected_per_project
  on public.supplier_quotations(project_id)
  where is_selected = true;
