-- AKA / ชื่อเรียกย่อ ของลูกค้า-คู่ค้า (ส่วน sync ทั้งหมดอยู่ใน 0032)
alter table public.partners
  add column if not exists aka text;

alter table public.projects
  add column if not exists customer_aka text;
