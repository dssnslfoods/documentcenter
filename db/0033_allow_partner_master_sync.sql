-- อนุญาตให้ Master Data คู่ค้า/ลูกค้า sync ป้าย AKA ไปยังโครงการที่ปิดแล้ว
-- โดยยังคงห้ามแก้ไขรายละเอียดโครงการอื่นทั้งหมด
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

    -- Trigger projects_updated เปลี่ยน updated_at ใน UPDATE เดียวกัน จึงไม่นับเป็นข้อมูลโครงการที่ผู้ใช้แก้ไข
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