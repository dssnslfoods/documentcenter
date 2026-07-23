-- =====================================================================
-- Reseed — Project-Centric mockup data
-- Run in Supabase SQL Editor AFTER 0001..0006 and after at least one user
-- has signed up (used as owner_id for seeded records).
--
-- This script:
--   1) Clears existing transactional/mock data (keeps reference tables:
--      departments, document_categories, partners, permission_templates,
--      system_settings, user_roles).
--   2) Reinserts realistic Thai sample data aligned with the new
--      project-centric workflow (8 lifecycle stages).
-- =====================================================================

-- ---------- 1) Wipe transactional data (only tables that exist) ----------
do $$
declare
  tbls text[] := array[
    'project_milestones','customer_quotations','supplier_quotations',
    'project_documents','project_member_permissions','project_members',
    'notifications','contract_attachments','contract_milestones',
    'approvals','document_versions','audit_logs',
    'documents','contracts','quotations','procurements','projects'
  ];
  t text;
begin
  foreach t in array tbls loop
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t) then
      execute format('truncate table public.%I restart identity cascade', t);
    end if;
  end loop;
end $$;

-- Make sure reference partners exist (idempotent — will no-op if seeded before)
insert into public.partners(code, name, type, tax_id, email, phone, business_type, status) values
  ('PT-0001','บริษัท กรุงไทยเทคโนโลยี จำกัด','supplier','0105561000123','contact@ktt.co.th','02-000-0001','เทคโนโลยีสารสนเทศ','active'),
  ('PT-0002','บริษัท ไทยเจริญพัฒนา จำกัด (มหาชน)','both','0107561000456','info@tcp.co.th','02-000-0002','ก่อสร้างและพัฒนาอสังหาริมทรัพย์','active'),
  ('PT-0003','บริษัท สยามอุตสาหกรรม จำกัด','supplier','0105562000789','sales@sindustry.co.th','02-000-0003','ผู้ผลิตชิ้นส่วน','active'),
  ('PT-0004','บริษัท เอสซีจี โลจิสติกส์ จำกัด','supplier','0105563001111','contact@scg-log.co.th','02-000-0004','ขนส่งและโลจิสติกส์','active'),
  ('PT-0005','บริษัท เจริญโภคภัณฑ์อาหาร จำกัด','customer','0107537000222','purchase@cpfood.co.th','02-000-0005','อุตสาหกรรมอาหาร','active'),
  ('PT-0006','บริษัท ปตท. จำกัด (มหาชน)','both','0107544000333','contact@pttplc.com','02-000-0006','พลังงาน','active'),
  ('PT-0007','บริษัท ทรู คอร์ปอเรชั่น จำกัด (มหาชน)','both','0107549000444','info@truecorp.co.th','02-000-0007','โทรคมนาคม','active'),
  ('PT-0008','บริษัท กสิกรไทย บิสซิเนส-เทคโนโลยี จำกัด','supplier','0105558000555','contact@kbtg.tech','02-000-0008','เทคโนโลยีการเงิน','active'),
  ('PT-0009','บริษัท เดลต้า อีเลคโทรนิคส์ (ประเทศไทย) จำกัด (มหาชน)','supplier','0107537000666','sales@deltath.com','02-000-0009','อิเล็กทรอนิกส์','active'),
  ('PT-0010','บริษัท ล็อกซเล่ย์ จำกัด (มหาชน)','supplier','0107537000777','info@loxley.co.th','02-000-0010','เทคโนโลยีและการค้า','active'),
  ('PT-0011','บริษัท ไทยเบฟเวอเรจ จำกัด (มหาชน)','customer','0107546000888','contact@thaibev.com','02-000-0011','อาหารและเครื่องดื่ม','active'),
  ('PT-0012','บริษัท เอไอเอส จำกัด (มหาชน)','both','0107536000999','business@ais.co.th','02-000-0012','โทรคมนาคม','active'),
  ('PT-0013','บริษัท เซ็นทรัลพัฒนา จำกัด (มหาชน)','customer','0107534010101','partner@cpn.co.th','02-000-0013','ค้าปลีกและอสังหาฯ','active'),
  ('PT-0014','บริษัท ไมโครซอฟท์ (ประเทศไทย) จำกัด','supplier','0105539020202','th-sales@microsoft.com','02-000-0014','ซอฟต์แวร์','active'),
  ('PT-0015','บริษัท แสนสิริ จำกัด (มหาชน)','both','0107536030303','partner@sansiri.com','02-000-0015','พัฒนาอสังหาริมทรัพย์','active')
on conflict (code) do nothing;

-- ---------- 2) Seed project-centric mockup ----------
do $$
declare
  admin_id uuid;
  d_proc uuid; d_legal uuid; d_fin uuid;
  s_ktt uuid; s_delta uuid; s_lox uuid; s_ms uuid; s_kbtg uuid; s_siam uuid;
  c_cpf uuid; c_thaibev uuid; c_cpn uuid; c_sansiri uuid; c_ptt uuid; c_true uuid;
  prj uuid;
begin
  select id into admin_id from auth.users order by created_at asc limit 1;
  if admin_id is null then
    raise exception 'No auth.users found. Sign up a user first, then re-run this script.';
  end if;

  select id into d_proc  from public.departments where code='PROC';
  select id into d_legal from public.departments where code='LEGAL';
  select id into d_fin   from public.departments where code='FIN';

  select id into s_ktt   from public.partners where code='PT-0001';
  select id into s_siam  from public.partners where code='PT-0003';
  select id into s_delta from public.partners where code='PT-0009';
  select id into s_lox   from public.partners where code='PT-0010';
  select id into s_ms    from public.partners where code='PT-0014';
  select id into s_kbtg  from public.partners where code='PT-0008';

  select id into c_cpf     from public.partners where code='PT-0005';
  select id into c_thaibev from public.partners where code='PT-0011';
  select id into c_cpn     from public.partners where code='PT-0013';
  select id into c_sansiri from public.partners where code='PT-0015';
  select id into c_ptt     from public.partners where code='PT-0006';
  select id into c_true    from public.partners where code='PT-0007';

  -- ============ P1: DRAFT ============
  insert into public.projects(code, name, description, department_id, owner_id, start_date, end_date, budget, status, customer_name, project_type)
  values ('PRJ-2026-001','ระบบ POS สาขาใหม่ 20 สาขา','จัดหาและติดตั้งระบบขายหน้าร้านสำหรับสาขาใหม่ทั่วประเทศ',
          d_proc, admin_id, '2026-03-01','2026-09-30', 12000000, 'draft', 'บริษัท เซ็นทรัลพัฒนา จำกัด (มหาชน)', 'IT Solution')
  returning id into prj;
  insert into public.project_documents(project_id, document_type, document_name, file_url, uploaded_by)
  values (prj, 'rfq_spec', 'ร่าง TOR ระบบ POS v0.3', 'seed://tor-pos-draft.pdf', admin_id);

  -- ============ P2: RFQ_SENT ============
  insert into public.projects(code, name, description, department_id, owner_id, start_date, end_date, budget, status, customer_name, project_type)
  values ('PRJ-2026-002','ปรับปรุงระบบ Data Center สำนักงานใหญ่','อัปเกรด server, storage, network core',
          d_proc, admin_id, '2026-04-01','2026-10-31', 25000000, 'rfq_sent', 'บริษัท ทรู คอร์ปอเรชั่น จำกัด (มหาชน)', 'Infrastructure')
  returning id into prj;
  insert into public.project_documents(project_id, document_type, document_name, file_url, uploaded_by) values
    (prj,'rfq_spec','RFQ Data Center Upgrade 2026','seed://rfq-dc-2026.pdf', admin_id),
    (prj,'tor','TOR ระบบ Data Center','seed://tor-dc-2026.pdf', admin_id);

  -- ============ P3: QUOTATION_RECEIVED (3 suppliers) ============
  insert into public.projects(code, name, description, department_id, owner_id, start_date, end_date, budget, status, customer_name, project_type)
  values ('PRJ-2026-003','โครงการติดตั้ง Solar Rooftop โรงงาน','ระบบผลิตไฟฟ้าจากแสงอาทิตย์ กำลังผลิต 1.2 MW',
          d_proc, admin_id, '2026-05-01','2027-01-31', 42000000, 'quotation_received', 'บริษัท ปตท. จำกัด (มหาชน)', 'Energy')
  returning id into prj;
  insert into public.supplier_quotations(project_id, supplier_id, supplier_name, quotation_amount, received_date, notes, created_by) values
    (prj, s_delta, 'บริษัท เดลต้า อีเลคโทรนิคส์', 38500000, current_date - 12, 'รับประกัน 10 ปี, ส่งมอบ 8 เดือน', admin_id),
    (prj, s_lox,   'บริษัท ล็อกซเล่ย์',           40200000, current_date - 10, 'มี O&M 5 ปีรวมในราคา', admin_id),
    (prj, s_ktt,   'บริษัท กรุงไทยเทคโนโลยี',    36900000, current_date - 8,  'ราคาไม่รวม inverter สำรอง', admin_id);
  insert into public.project_documents(project_id, document_type, document_name, file_url, uploaded_by)
  values (prj,'rfq_spec','TOR Solar Rooftop 1.2MW','seed://tor-solar-1.2mw.pdf', admin_id);

  -- ============ P4: PROPOSAL_SUBMITTED ============
  insert into public.projects(code, name, description, department_id, owner_id, start_date, end_date, budget, status, customer_name, project_type)
  values ('PRJ-2026-004','ระบบ CRM สำหรับธุรกิจค้าปลีก','พัฒนาและติดตั้งระบบ CRM รองรับลูกค้า 500,000 ราย',
          d_proc, admin_id, '2026-04-15','2026-12-31', 8500000, 'proposal_submitted', 'บริษัท ไทยเบฟเวอเรจ จำกัด (มหาชน)', 'IT Solution')
  returning id into prj;
  insert into public.supplier_quotations(project_id, supplier_id, supplier_name, quotation_amount, received_date, notes, created_by) values
    (prj, s_kbtg, 'บริษัท กสิกรไทย บิสซิเนส-เทคโนโลยี', 6200000, current_date - 20, 'รวม License 3 ปี', admin_id),
    (prj, s_ms,   'บริษัท ไมโครซอฟท์ (ประเทศไทย)',      7100000, current_date - 18, 'Dynamics 365 CRM', admin_id);
  insert into public.customer_quotations(project_id, quotation_amount, submitted_date, notes, file_url, is_final, created_by)
  values (prj, 8200000, current_date - 5, 'เสนอราคาลูกค้ารวมค่าติดตั้งและอบรม', 'seed://quo-crm-thaibev.pdf', true, admin_id);
  insert into public.project_documents(project_id, document_type, document_name, file_url, uploaded_by)
  values (prj,'final_quotation','ใบเสนอราคาฉบับสมบูรณ์','seed://final-quo-crm.pdf', admin_id);

  -- ============ P5: WON (in negotiation / contract prep) ============
  insert into public.projects(code, name, description, department_id, owner_id, start_date, end_date, budget, contract_value, status, customer_name, project_type)
  values ('PRJ-2026-005','ระบบ ERP โรงงานผลิตอาหาร','ติดตั้งและปรับแต่ง SAP S/4HANA สำหรับโรงงาน 3 แห่ง',
          d_proc, admin_id, '2026-02-01','2027-01-31', 35000000, 32800000, 'won', 'บริษัท เจริญโภคภัณฑ์อาหาร จำกัด', 'ERP')
  returning id into prj;
  insert into public.supplier_quotations(project_id, supplier_id, supplier_name, quotation_amount, received_date, notes, created_by) values
    (prj, s_ms, 'ไมโครซอฟท์ (ประเทศไทย)', 28500000, current_date - 45, 'ผ่าน partner', admin_id),
    (prj, s_ktt,'กรุงไทยเทคโนโลยี',       26900000, current_date - 43, 'ผู้ชนะ', admin_id);
  insert into public.customer_quotations(project_id, quotation_amount, submitted_date, notes, file_url, is_final, created_by)
  values (prj, 32800000, current_date - 30, 'ลูกค้ายืนยันสั่งซื้อแล้ว', 'seed://final-quo-erp-cpf.pdf', true, admin_id);
  insert into public.project_documents(project_id, document_type, document_name, file_url, uploaded_by) values
    (prj,'contract','ร่างสัญญา ERP CPF','seed://draft-contract-erp.pdf', admin_id),
    (prj,'final_quotation','ใบเสนอราคาฉบับสมบูรณ์','seed://final-quo-erp.pdf', admin_id);

  -- ============ P6: IN_PROGRESS with milestones ============
  insert into public.projects(code, name, description, department_id, owner_id, start_date, end_date, budget, contract_value, status, customer_name, project_type)
  values ('PRJ-2025-010','โครงการติดตั้งระบบเครือข่ายอาคารสำนักงาน','โครงข่าย fiber + Wi-Fi 6 ทั่วอาคาร 25 ชั้น',
          d_proc, admin_id, '2025-10-01','2026-06-30', 18000000, 16500000, 'in_progress', 'บริษัท แสนสิริ จำกัด (มหาชน)', 'Infrastructure')
  returning id into prj;
  insert into public.supplier_quotations(project_id, supplier_id, supplier_name, quotation_amount, received_date, created_by) values
    (prj, s_lox,'ล็อกซเล่ย์',       15900000, current_date - 120, admin_id),
    (prj, s_ktt,'กรุงไทยเทคโนโลยี', 15200000, current_date - 118, admin_id);
  insert into public.customer_quotations(project_id, quotation_amount, submitted_date, is_final, created_by)
  values (prj, 16500000, current_date - 100, true, admin_id);
  insert into public.project_documents(project_id, document_type, document_name, file_url, uploaded_by) values
    (prj,'contract','สัญญาว่าจ้าง Sansiri Network','seed://contract-sansiri.pdf', admin_id),
    (prj,'final_quotation','ใบเสนอราคาฉบับสมบูรณ์','seed://final-quo-sansiri.pdf', admin_id);
  insert into public.project_milestones(project_id, milestone_number, description, due_date, payment_type, payment_value, status, actual_completion_date, notes) values
    (prj, 1, 'ลงนามสัญญาและวางเงินมัดจำ',           current_date - 90, 'percentage', 20, 'completed', current_date - 88, 'รับเงินมัดจำ 3.3 ล้าน'),
    (prj, 2, 'ส่งมอบอุปกรณ์เครือข่ายชุดที่ 1',      current_date - 30, 'percentage', 30, 'completed', current_date - 28, null),
    (prj, 3, 'ติดตั้ง Backbone ชั้น 1-12',            current_date + 15, 'percentage', 20, 'pending',   null, 'กำลังดำเนินการ 60%'),
    (prj, 4, 'ติดตั้ง Backbone ชั้น 13-25',           current_date + 60, 'percentage', 20, 'pending',   null, null),
    (prj, 5, 'ทดสอบระบบและส่งมอบ',                    current_date + 120,'percentage', 10, 'pending',   null, null);

  -- ============ P7: COMPLETED ============
  insert into public.projects(code, name, description, department_id, owner_id, start_date, end_date, budget, contract_value, status, customer_name, project_type, completion_comment)
  values ('PRJ-2025-005','ระบบสำรองข้อมูลบนคลาวด์','Migrate backup ทั้งหมดขึ้น cloud ปลอดภัยระดับ ISO 27001',
          d_proc, admin_id, '2025-03-01','2025-11-30', 5500000, 5200000, 'completed',
          'บริษัท เอไอเอส จำกัด (มหาชน)', 'Cloud', 'ส่งมอบตรงเวลา ลูกค้าพึงพอใจ')
  returning id into prj;
  insert into public.supplier_quotations(project_id, supplier_id, supplier_name, quotation_amount, received_date, created_by) values
    (prj, s_ktt, 'กรุงไทยเทคโนโลยี', 4900000, current_date - 300, admin_id);
  insert into public.customer_quotations(project_id, quotation_amount, submitted_date, is_final, created_by)
  values (prj, 5200000, current_date - 280, true, admin_id);
  insert into public.project_milestones(project_id, milestone_number, description, due_date, payment_type, payment_value, status, actual_completion_date) values
    (prj, 1, 'เริ่มโครงการและวาง infrastructure',   current_date - 240,'percentage', 30, 'completed', current_date - 238),
    (prj, 2, 'Migrate ข้อมูลรอบแรก 50%',            current_date - 150,'percentage', 40, 'completed', current_date - 148),
    (prj, 3, 'Migrate ข้อมูลครบ 100% + ส่งมอบ',      current_date - 60, 'percentage', 30, 'completed', current_date - 55);

  -- ============ P8: LOST ============
  insert into public.projects(code, name, description, department_id, owner_id, start_date, end_date, budget, status, customer_name, project_type, lost_reason)
  values ('PRJ-2025-012','ระบบกล้องวงจรปิด AI ห้างสรรพสินค้า','ติดตั้งกล้อง 320 ตัว พร้อม AI analytics',
          d_proc, admin_id, '2025-09-01','2026-03-31', 9500000, 'lost', 'บริษัท เซ็นทรัลพัฒนา จำกัด (มหาชน)',
          'Security', 'ราคาสูงกว่าคู่แข่งประมาณ 12% ลูกค้าเลือกผู้ให้บริการรายอื่น')
  returning id into prj;
  insert into public.supplier_quotations(project_id, supplier_id, supplier_name, quotation_amount, received_date, created_by) values
    (prj, s_delta,'เดลต้า อีเลคโทรนิคส์', 8600000, current_date - 180, admin_id),
    (prj, s_siam, 'สยามอุตสาหกรรม',       8900000, current_date - 178, admin_id);
  insert into public.customer_quotations(project_id, quotation_amount, submitted_date, is_final, notes, created_by)
  values (prj, 9400000, current_date - 160, true, 'ลูกค้าปฏิเสธ — ราคาสูงกว่าคู่แข่ง', admin_id);

  -- ---------- Notifications for admin ----------
  insert into public.notifications(user_id, title, body, type) values
    (admin_id,'งวดงานใกล้ครบกำหนด','โครงการ PRJ-2025-010 งวดที่ 3 ครบกำหนดใน 15 วัน','milestone_due'),
    (admin_id,'ใบเสนอราคาซัพพลายเออร์ใหม่','โครงการ PRJ-2026-003 มีใบเสนอราคา 3 ราย รอเปรียบเทียบ','supplier_quotation'),
    (admin_id,'โครงการเปลี่ยนสถานะ','PRJ-2026-005 ย้ายไปสถานะ Won — เริ่มจัดทำสัญญา','project_status'),
    (admin_id,'โครงการเสร็จสมบูรณ์','PRJ-2025-005 ส่งมอบเรียบร้อยแล้ว','project_completed');
end $$;

-- =====================================================================
-- Done. Reload the app — you will see 8 projects covering all lifecycle
-- stages with supplier/customer quotations, milestones, and documents.
-- =====================================================================
