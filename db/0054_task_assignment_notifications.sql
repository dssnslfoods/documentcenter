-- 0054: แจ้งเตือนผู้รับงานทันทีเมื่อถูกมอบหมาย + แจ้งเตือนตามวันกำหนดส่งมอบ

-- ---------- 1) แจ้งเตือนทันทีเมื่อมอบหมายงาน ----------
create or replace function public.trg_notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_name text;
  v_assigner text;
  v_title text;
  v_body text;
  v_link text;
begin
  if new.assignee_id is null then
    return new;
  end if;

  -- แจ้งเตือนเมื่อเพิ่งถูกมอบหมาย หรือถูกเปลี่ยนตัวผู้รับผิดชอบ
  if tg_op = 'UPDATE'
     and new.assignment_status is not distinct from old.assignment_status
     and new.assignee_id is not distinct from old.assignee_id then
    return new;
  end if;

  if new.assignment_status <> 'assigned' then
    return new;
  end if;

  select name into v_project_name from public.projects where id = new.project_id;
  select coalesce(full_name, email, 'ผู้บริหารโครงการ')
    into v_assigner from public.profiles where id = coalesce(new.assigned_by, auth.uid());

  v_title := format('คุณได้รับมอบหมายงาน: %s', new.name);
  v_body := format('%s มอบหมายงานในโครงการ %s — กำหนดส่งมอบ %s%s',
                   coalesce(v_assigner, 'ผู้บริหารโครงการ'),
                   coalesce(v_project_name, '-'),
                   to_char(new.end_date, 'DD/MM/YYYY'),
                   case when new.description is not null and length(trim(new.description)) > 0
                        then E'\n' || new.description else '' end);
  v_link := format('/assignments/board/%s', new.project_id);

  perform public.create_notification(new.assignee_id, v_title, v_body, 'task_assigned', v_link);
  return new;
end;
$$;

drop trigger if exists notify_task_assignment_trg on public.project_tasks;
create trigger notify_task_assignment_trg
  after insert or update of assignment_status, assignee_id on public.project_tasks
  for each row execute function public.trg_notify_task_assignment();

-- ---------- 2) แจ้งเตือนผู้รับงานตามวันกำหนดส่งมอบ ----------
create or replace function public.scan_assignment_due_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_title text;
  v_body text;
  v_link text;
  v_type text;
begin
  for rec in
    select t.id, t.name, t.end_date, t.project_id, p.name as project_name, t.assignee_id
    from public.project_tasks t
    join public.projects p on p.id = t.project_id
    where t.assignee_id is not null
      and coalesce(t.assignment_status, 'draft') in ('assigned','acknowledged','revision')
      and t.end_date <= current_date + interval '1 day'
  loop
    if rec.end_date < current_date then
      v_type := 'assignment_overdue';
      v_title := format('งานที่คุณรับผิดชอบเลยกำหนดส่งมอบ: %s', rec.name);
      v_body := format('โครงการ %s — ครบกำหนดวันที่ %s', rec.project_name, to_char(rec.end_date, 'DD/MM/YYYY'));
    elsif rec.end_date = current_date then
      v_type := 'assignment_due_today';
      v_title := format('ครบกำหนดส่งมอบวันนี้: %s', rec.name);
      v_body := format('โครงการ %s — กรุณาส่งมอบงานภายในวันนี้', rec.project_name);
    else
      v_type := 'assignment_due_tomorrow';
      v_title := format('ครบกำหนดส่งมอบพรุ่งนี้: %s', rec.name);
      v_body := format('โครงการ %s — กำหนดส่งมอบ %s', rec.project_name, to_char(rec.end_date, 'DD/MM/YYYY'));
    end if;

    v_link := format('/assignments/board/%s', rec.project_id);

    -- กันแจ้งเตือนซ้ำภายในวันเดียวกัน
    if not exists (
      select 1 from public.notifications n
      where n.user_id = rec.assignee_id
        and n.type = v_type
        and n.title = v_title
        and n.created_at >= date_trunc('day', now())
    ) then
      perform public.create_notification(rec.assignee_id, v_title, v_body, v_type, v_link);
    end if;
  end loop;
end;
$$;

grant execute on function public.scan_assignment_due_notifications() to authenticated;
grant execute on function public.scan_assignment_due_notifications() to service_role;
