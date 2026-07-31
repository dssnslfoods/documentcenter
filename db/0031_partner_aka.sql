-- AKA / ชื่อเรียกย่อ ของลูกค้า-คู่ค้า + snapshot ไปที่โครงการเพื่อแสดงบนการ์ด
alter table public.partners
  add column if not exists aka text;

alter table public.projects
  add column if not exists customer_aka text;

-- เติมค่าเริ่มต้นจาก master
update public.projects p
set customer_aka = pt.aka
from public.partners pt
where p.customer_id = pt.id and pt.aka is not null;

-- sync เมื่อโครงการเปลี่ยนลูกค้า
create or replace function public.sync_project_customer_aka()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_id is not null then
    select aka into new.customer_aka from public.partners where id = new.customer_id;
  else
    new.customer_aka := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_project_customer_aka on public.projects;
create trigger trg_sync_project_customer_aka
  before insert or update of customer_id on public.projects
  for each row execute function public.sync_project_customer_aka();

-- sync เมื่อแก้ไข aka ที่ master
create or replace function public.propagate_partner_aka()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.aka is distinct from old.aka then
    update public.projects set customer_aka = new.aka where customer_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_propagate_partner_aka on public.partners;
create trigger trg_propagate_partner_aka
  after update of aka on public.partners
  for each row execute function public.propagate_partner_aka();
