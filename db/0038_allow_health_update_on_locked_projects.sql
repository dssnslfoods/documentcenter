-- 0038: อนุญาตให้ระบบอัปเดต health_status / health_reason ได้แม้โครงการปิดแล้ว
-- (แก้ error: "โครงการปิดแล้ว ไม่สามารถแก้ไขข้อมูลได้" ตอนรัน db/0037)
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

    -- sync ป้าย AKA จาก Master Data
    if (new.customer_aka is distinct from old.customer_aka
        or new.customer_aka_color is distinct from old.customer_aka_color)
       and to_jsonb(new) - 'customer_aka' - 'customer_aka_color' - 'updated_at'
         = to_jsonb(old) - 'customer_aka' - 'customer_aka_color' - 'updated_at' then
      return new;
    end if;

    -- ระบบคำนวณสถานะสุขภาพโครงการ (RAG) อัตโนมัติ
    if (new.health_status is distinct from old.health_status
        or new.health_reason is distinct from old.health_reason
        or new.health_updated_at is distinct from old.health_updated_at)
       and to_jsonb(new) - 'health_status' - 'health_reason' - 'health_updated_at' - 'updated_at'
         = to_jsonb(old) - 'health_status' - 'health_reason' - 'health_updated_at' - 'updated_at' then
      return new;
    end if;

    raise exception 'โครงการปิดแล้ว ไม่สามารถแก้ไขข้อมูลได้';
  end if;
  return new;
end;
$$;
