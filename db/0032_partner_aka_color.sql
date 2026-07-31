-- สีของป้าย AKA (แก้ปัญหา trigger โครงการปิดแล้ว ระหว่าง sync ข้อมูล AKA)
alter table public.partners
  add column if not exists aka_color text;

alter table public.projects
  add column if not exists customer_aka_color text;

-- 1) อนุญาตให้ระบบ sync ค่า AKA ได้แม้โครงการปิดแล้ว (เป็น master data ไม่ใช่การแก้ไขโดยผู้ใช้)
create or replace function public.guard_locked_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'completed' then
    if new.status is distinct from old.status
       or new.archived_at is distinct from old.archived_at then
      return new;
    end if;
    -- อนุญาตเฉพาะการ sync ป้าย AKA จาก master ลูกค้า
    -- projects_updated จะเปลี่ยน updated_at อัตโนมัติใน UPDATE เดียวกัน จึงต้องตัด field ระบบออกด้วย
    if (new.customer_aka is distinct from old.customer_aka
        or new.customer_aka_color is distinct from old.customer_aka_color)
       and to_jsonb(new) - 'customer_aka' - 'customer_aka_color' - 'updated_at'
         = to_jsonb(old) - 'customer_aka' - 'customer_aka_color' - 'updated_at' then
      return new;
    end if;
    raise exception 'โครงการปิดแล้ว ไม่สามารถแก้ไขข้อมูลได้';
  end if;
  return new;
end;
$$;

-- 2) เติมค่าเริ่มต้นจาก master (ปิด trigger ชั่วคราวเพื่อ backfill)
alter table public.projects disable trigger trg_guard_locked_project;

update public.projects p
set customer_aka = pt.aka,
    customer_aka_color = pt.aka_color
from public.partners pt
where p.customer_id = pt.id;

alter table public.projects enable trigger trg_guard_locked_project;

-- 3) sync เมื่อโครงการเปลี่ยนลูกค้า
create or replace function public.sync_project_customer_aka()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_id is not null then
    select aka, aka_color into new.customer_aka, new.customer_aka_color
    from public.partners where id = new.customer_id;
  else
    new.customer_aka := null;
    new.customer_aka_color := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_project_customer_aka on public.projects;
create trigger trg_sync_project_customer_aka
  before insert or update of customer_id on public.projects
  for each row execute function public.sync_project_customer_aka();

-- 4) sync เมื่อแก้ไข AKA ที่ master
create or replace function public.propagate_partner_aka()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.aka is distinct from old.aka or new.aka_color is distinct from old.aka_color then
    update public.projects
      set customer_aka = new.aka, customer_aka_color = new.aka_color
      where customer_id = new.id
        and (customer_aka is distinct from new.aka or customer_aka_color is distinct from new.aka_color);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_propagate_partner_aka on public.partners;
create trigger trg_propagate_partner_aka
  after update of aka, aka_color on public.partners
  for each row execute function public.propagate_partner_aka();
