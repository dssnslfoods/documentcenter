-- หัวข้อ/ชื่องาน ของใบเสนอราคา Supplier เพื่อให้ทราบว่าเป็นใบเสนอราคางานอะไร
alter table public.supplier_quotations
  add column if not exists title text;

alter table public.customer_quotations
  add column if not exists title text;

notify pgrst, 'reload schema';
