-- ลำดับการแสดงผลของบันทึก RFQ / Spec
alter table public.project_spec_notes
  add column if not exists sort_order integer not null default 0;

-- ตั้งค่าลำดับเริ่มต้นจากวันที่อัปเดตล่าสุด
with ranked as (
  select id,
         row_number() over (partition by project_id, note_type order by updated_at desc) as rn
  from public.project_spec_notes
)
update public.project_spec_notes n
set sort_order = ranked.rn
from ranked
where ranked.id = n.id and n.sort_order = 0;

create index if not exists project_spec_notes_sort_idx
  on public.project_spec_notes (project_id, note_type, sort_order);

notify pgrst, 'reload schema';
