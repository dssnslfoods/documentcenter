-- =====================================================================
-- 0037: Project Health / RAG Status + Automated Notification Core
-- =====================================================================

-- ---------- 1) Project health status ----------
do $$ begin
  create type public.project_health_status as enum ('green','yellow','red','grey');
exception when duplicate_object then null; end $$;

alter table public.projects
  add column if not exists health_status public.project_health_status not null default 'green',
  add column if not exists health_reason text;

comment on column public.projects.health_status is
  'green=ตามแผน, yellow=ใกล้เสี่ยง/ใกล้ครบกำหนด, red=ล่าช้า/เลยกำหนด, grey=ปิดโครงการแล้ว';
comment on column public.projects.health_reason is 'เหตุผลที่ระบบกำหนด health_status';

-- ---------- 2) Health computation function ----------
create or replace function public.compute_project_health(_project_id uuid)
returns public.project_health_status
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text;
  v_end_date date;
  v_now date := current_date;
  v_overdue_tasks int;
  v_upcoming_tasks int;
  v_overdue_milestones int;
  v_upcoming_milestones int;
  v_total_tasks int;
  v_done_tasks int;
  v_progress numeric;
  v_expected_progress numeric;
  v_days_total int;
  v_days_elapsed int;
  v_result public.project_health_status;
begin
  select status, end_date into v_status, v_end_date
  from public.projects where id = _project_id;

  if v_status is null then return 'green'; end if;

  -- Completed / lost projects: grey
  if v_status in ('completed','lost') then
    return 'grey';
  end if;

  -- Count overdue/upcoming tasks
  select
    count(*) filter (where status <> 'done' and end_date < v_now),
    count(*) filter (where status <> 'done' and end_date between v_now and v_now + interval '7 days'),
    count(*),
    count(*) filter (where status = 'done')
  into v_overdue_tasks, v_upcoming_tasks, v_total_tasks, v_done_tasks
  from public.project_tasks
  where project_id = _project_id;

  -- Count overdue/upcoming milestones
  select
    count(*) filter (where status not in ('completed','approved') and due_date < v_now),
    count(*) filter (where status not in ('completed','approved') and due_date between v_now and v_now + interval '7 days')
  into v_overdue_milestones, v_upcoming_milestones
  from public.project_milestones
  where project_id = _project_id;

  -- Red: overdue items or project end_date passed
  if v_overdue_tasks > 0 or v_overdue_milestones > 0 then
    return 'red';
  end if;

  if v_end_date is not null and v_end_date < v_now and v_status not in ('completed','lost') then
    return 'red';
  end if;

  -- Yellow: upcoming due dates OR progress behind schedule
  if v_upcoming_tasks > 0 or v_upcoming_milestones > 0 then
    return 'yellow';
  end if;

  -- Progress vs expected timeline
  if v_total_tasks > 0 then
    v_progress := (v_done_tasks::numeric / v_total_tasks::numeric) * 100;
  else
    v_progress := 0;
  end if;

  if v_status = 'in_progress' then
    -- Compare against project start/end date window
    select
      (coalesce(p.end_date, v_now) - p.start_date)::int,
      (v_now - p.start_date)::int,
      p.progress
    into v_days_total, v_days_elapsed, v_progress
    from public.projects p
    where p.id = _project_id;

    if v_days_total > 0 and v_days_elapsed > 0 then
      v_expected_progress := (v_days_elapsed::numeric / v_days_total::numeric) * 100;
      if v_progress < v_expected_progress - 15 then
        return 'red';
      elsif v_progress < v_expected_progress - 5 then
        return 'yellow';
      end if;
    end if;
  end if;

  return 'green';
end;
$$;

-- Helper to update project health reason text
create or replace function public.update_project_health(_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_health public.project_health_status;
  v_reason text;
  v_now date := current_date;
  v_overdue_tasks int;
  v_upcoming_tasks int;
  v_overdue_milestones int;
  v_upcoming_milestones int;
  v_end_date date;
  v_status text;
  v_progress int;
  v_expected_progress numeric;
  v_days_total int;
  v_days_elapsed int;
begin
  v_health := public.compute_project_health(_project_id);

  select status, end_date, progress into v_status, v_end_date, v_progress
  from public.projects where id = _project_id;

  select
    count(*) filter (where status <> 'done' and end_date < v_now),
    count(*) filter (where status <> 'done' and end_date between v_now and v_now + interval '7 days'),
    count(*) filter (where status not in ('completed','approved') and due_date < v_now),
    count(*) filter (where status not in ('completed','approved') and due_date between v_now and v_now + interval '7 days')
  into v_overdue_tasks, v_upcoming_tasks, v_overdue_milestones, v_upcoming_milestones
  from public.project_tasks t
  left join public.project_milestones m on m.project_id = _project_id
  where t.project_id = _project_id;

  -- Recalculate for milestones separately
  select
    count(*) filter (where status not in ('completed','approved') and due_date < v_now),
    count(*) filter (where status not in ('completed','approved') and due_date between v_now and v_now + interval '7 days')
  into v_overdue_milestones, v_upcoming_milestones
  from public.project_milestones
  where project_id = _project_id;

  if v_status in ('completed','lost') then
    v_reason := 'โครงการปิดสถานะแล้ว';
  elsif v_overdue_tasks > 0 or v_overdue_milestones > 0 then
    v_reason := format(
      'มีงาน/งวดงานเลยกำหนด %s รายการ',
      (v_overdue_tasks + v_overdue_milestones)
    );
  elsif v_end_date is not null and v_end_date < v_now then
    v_reason := 'เลยกำหนดวันสิ้นสุดโครงการ';
  elsif v_upcoming_tasks > 0 or v_upcoming_milestones > 0 then
    v_reason := format('มีงาน/งวดงานใกล้ครบกำหนดภายใน 7 วัน จำนวน %s รายการ', (v_upcoming_tasks + v_upcoming_milestones));
  elsif v_status = 'in_progress' then
    select
      (coalesce(p.end_date, v_now) - p.start_date)::int,
      (v_now - p.start_date)::int
    into v_days_total, v_days_elapsed
    from public.projects p
    where p.id = _project_id;

    if v_days_total > 0 and v_days_elapsed > 0 then
      v_expected_progress := (v_days_elapsed::numeric / v_days_total::numeric) * 100;
      if v_progress < v_expected_progress - 15 then
        v_reason := format('ความคืบหน้าตกหลังแผนมาก (ควร %s%% แต่ได้ %s%%)', round(v_expected_progress)::int, v_progress);
      elsif v_progress < v_expected_progress - 5 then
        v_reason := format('ความคืบหน้าตกหลังแผนเล็กน้อย (ควร %s%% แต่ได้ %s%%)', round(v_expected_progress)::int, v_progress);
      else
        v_reason := 'ดำเนินการตามแผน';
      end if;
    else
      v_reason := 'ดำเนินการตามแผน';
    end if;
  else
    v_reason := 'สถานะปกติ';
  end if;

  update public.projects
  set health_status = v_health,
      health_reason = v_reason,
      updated_at = now()
  where id = _project_id;
end;
$$;

-- ---------- 3) Triggers to keep health in sync ----------
-- Recompute when tasks change
create or replace function public.trg_recompute_project_health()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.update_project_health(old.project_id);
    return old;
  else
    perform public.update_project_health(new.project_id);
    return new;
  end if;
end;
$$;

drop trigger if exists trg_project_tasks_health on public.project_tasks;
create trigger trg_project_tasks_health
  after insert or update or delete on public.project_tasks
  for each row execute function public.trg_recompute_project_health();

drop trigger if exists trg_project_milestones_health on public.project_milestones;
create trigger trg_project_milestones_health
  after insert or update or delete on public.project_milestones
  for each row execute function public.trg_recompute_project_health();

-- Recompute when project dates/progress change
create or replace function public.trg_project_health_self()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.start_date is distinct from old.start_date
     or new.end_date is distinct from old.end_date
     or new.progress is distinct from old.progress
     or new.status is distinct from old.status
  then
    perform public.update_project_health(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_project_health_self on public.projects;
create trigger trg_project_health_self
  after update on public.projects
  for each row execute function public.trg_project_health_self();

-- ---------- 4) Backfill existing projects ----------
update public.projects
set health_status = public.compute_project_health(id),
    health_reason = 'คำนวณสถานะสุขภาพย้อนหลัง'
where health_status = 'green' or health_status is null;

-- ---------- 5) Notification helpers ----------
-- Generic function to create notification (bypasses RLS via security definer)
create or replace function public.create_notification(
  _user_id uuid,
  _title text,
  _body text,
  _type text,
  _link text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (user_id, title, body, type, link)
  values (_user_id, _title, _body, _type, _link)
  returning id into v_id;
  return v_id;
end;
$$;

-- Notify project members when status changes
create or replace function public.trg_notify_project_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_old_label text;
  v_new_label text;
  v_changer text;
  v_project_name text;
begin
  if old.status is distinct from new.status then
    select coalesce(full_name, email, 'ผู้ใช้')
    into v_changer
    from public.profiles
    where id = auth.uid();

    select name into v_project_name from public.projects where id = new.id;

    v_old_label := coalesce(old.status, 'ไม่ระบุ');
    v_new_label := coalesce(new.status, 'ไม่ระบุ');

    for v_member_id in
      select user_id from public.project_members where project_id = new.id
    loop
      if v_member_id is distinct from auth.uid() then
        perform public.create_notification(
          v_member_id,
          format('สถานะโครงการเปลี่ยน: %s', v_project_name),
          format('%s เปลี่ยนสถานะจาก %s เป็น %s', v_changer, v_old_label, v_new_label),
          'project_status_changed',
          format('/projects/%s', new.id)
        );
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_project_status_notify on public.projects;
create trigger trg_project_status_notify
  after update on public.projects
  for each row execute function public.trg_notify_project_status_change();

-- ---------- 6) Daily reminder scanner ----------
-- Call this via a server function or cron endpoint to generate reminders.
create or replace function public.scan_due_date_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_project_name text;
  v_member_id uuid;
  v_count int;
  v_item_type text;
  v_due_date date;
  v_title text;
  v_link text;
  rec record;
begin
  -- Clear old pending reminders first (optional, idempotent)
  delete from public.notifications
  where type in ('milestone_due_soon','task_due_soon','milestone_overdue','task_overdue')
    and created_at < current_date;

  -- Milestones due within 3 days
  for rec in
    select m.project_id, p.name as project_name, m.description, m.due_date,
           count(*) over (partition by m.project_id) as project_count
    from public.project_milestones m
    join public.projects p on p.id = m.project_id
    where m.status not in ('completed','approved')
      and m.due_date between current_date and current_date + interval '3 days'
  loop
    v_title := format('งวดงาน "%s" ใกล้ครบกำหนด (%s)', rec.description, rec.due_date);
    v_body := format('โครงการ %s มีงวดงานที่กำหนดส่งมอบวันที่ %s', rec.project_name, rec.due_date);
    v_link := format('/projects/%s', rec.project_id);

    for v_member_id in
      select user_id from public.project_members where project_id = rec.project_id
    loop
      perform public.create_notification(v_member_id, v_title, v_body, 'milestone_due_soon', v_link);
    end loop;
  end loop;

  -- Tasks due within 3 days
  for rec in
    select t.project_id, p.name as project_name, t.name, t.end_date
    from public.project_tasks t
    join public.projects p on p.id = t.project_id
    where t.status <> 'done'
      and t.end_date between current_date and current_date + interval '3 days'
  loop
    v_title := format('งาน "%s" ใกล้ครบกำหนด (%s)', rec.name, rec.end_date);
    v_body := format('โครงการ %s มีงานที่กำหนดเสร็จวันที่ %s', rec.project_name, rec.end_date);
    v_link := format('/projects/%s', rec.project_id);

    for v_member_id in
      select user_id from public.project_members where project_id = rec.project_id
    loop
      perform public.create_notification(v_member_id, v_title, v_body, 'task_due_soon', v_link);
    end loop;
  end loop;

  -- Overdue milestones
  for rec in
    select m.project_id, p.name as project_name, m.description, m.due_date
    from public.project_milestones m
    join public.projects p on p.id = m.project_id
    where m.status not in ('completed','approved')
      and m.due_date < current_date
  loop
    v_title := format('งวดงาน "%s" เลยกำหนด (ครบวันที่ %s)', rec.description, rec.due_date);
    v_body := format('โครงการ %s มีงวดงานเลยกำหนดส่งมอบ', rec.project_name);
    v_link := format('/projects/%s', rec.project_id);

    for v_member_id in
      select user_id from public.project_members where project_id = rec.project_id
    loop
      perform public.create_notification(v_member_id, v_title, v_body, 'milestone_overdue', v_link);
    end loop;
  end loop;

  -- Overdue tasks
  for rec in
    select t.project_id, p.name as project_name, t.name, t.end_date
    from public.project_tasks t
    join public.projects p on p.id = t.project_id
    where t.status <> 'done'
      and t.end_date < current_date
  loop
    v_title := format('งาน "%s" เลยกำหนด (ครบวันที่ %s)', rec.name, rec.end_date);
    v_body := format('โครงการ %s มีงานเลยกำหนดเสร็จ', rec.project_name);
    v_link := format('/projects/%s', rec.project_id);

    for v_member_id in
      select user_id from public.project_members where project_id = rec.project_id
    loop
      perform public.create_notification(v_member_id, v_title, v_body, 'task_overdue', v_link);
    end loop;
  end loop;
end;
$$;

-- ---------- 7) Grants ----------
grant execute on function public.compute_project_health(uuid) to authenticated;
grant execute on function public.update_project_health(uuid) to authenticated;
grant execute on function public.create_notification(uuid, text, text, text, text) to authenticated;
grant execute on function public.scan_due_date_notifications() to authenticated;

grant select, update on public.projects to authenticated;
grant all on public.projects to service_role;
