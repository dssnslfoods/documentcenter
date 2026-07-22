-- =====================================================================
-- Seed data (Thai sample data)
-- Run AFTER 0001_initial_schema.sql AND after signing up at least one user
-- (so auth.users has a row for the owner_id foreign keys).
-- =====================================================================

insert into public.departments(code, name_th, name_en) values
  ('EXEC','สำนักผู้บริหาร','Executive'),
  ('FIN','ฝ่ายการเงินและบัญชี','Finance & Accounting'),
  ('LEGAL','ฝ่ายกฎหมาย','Legal'),
  ('PROC','ฝ่ายจัดซื้อจัดจ้าง','Procurement'),
  ('HR','ฝ่ายทรัพยากรบุคคล','Human Resources')
on conflict (code) do nothing;

insert into public.document_categories(code, name_th, name_en, prefix) values
  ('CON','สัญญา','Contract','CON'),
  ('QUO','ใบเสนอราคา','Quotation','QUO'),
  ('PO','ใบสั่งซื้อ','Purchase Order','PO'),
  ('SLA','ข้อตกลงการให้บริการ','Service Level Agreement','SLA'),
  ('LEG','เอกสารทางกฎหมาย','Legal Document','LEG'),
  ('FIN','เอกสารการเงิน','Financial Document','FIN'),
  ('HR','เอกสารฝ่ายบุคคล','HR Document','HR'),
  ('CERT','หนังสือรับรอง','Certificate','CERT'),
  ('LIC','ใบอนุญาต','License','LIC'),
  ('POL','นโยบายและระเบียบบริษัท','Policy','POL'),
  ('MIN','รายงานการประชุม','Meeting Minutes','MIN'),
  ('DOC','เอกสารทั่วไป','General Document','DOC')
on conflict (code) do nothing;

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

insert into public.projects(code, name, description, start_date, end_date, budget, status) values
  ('PRJ-2026-001','โครงการพัฒนาระบบ ERP ระยะที่ 2','อัปเกรดระบบ ERP รองรับการขยายธุรกิจ','2026-01-15','2026-12-31',15000000,'active'),
  ('PRJ-2026-002','โครงการปรับปรุงสำนักงานใหญ่','ปรับปรุงพื้นที่ทำงานชั้น 10-15','2026-03-01','2026-08-31',8500000,'active'),
  ('PRJ-2025-010','โครงการ Digital Transformation','เปลี่ยนผ่านสู่ดิจิทัลทั่วองค์กร','2025-06-01','2027-05-31',45000000,'active')
on conflict (code) do nothing;

insert into public.system_settings(key, value) values
  ('company_name', '"บริษัท ตัวอย่างองค์กร จำกัด (มหาชน)"'::jsonb),
  ('fiscal_year_start', '"01-01"'::jsonb),
  ('default_currency', '"THB"'::jsonb),
  ('reminder_days_default', '[90,60,30,14,7,3,1]'::jsonb)
on conflict (key) do nothing;

-- ---------- Contracts ----------
do $$
declare
  d_legal uuid; d_proc uuid; d_hr uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid; p7 uuid;
  admin_id uuid;
begin
  select id into d_legal from public.departments where code='LEGAL';
  select id into d_proc from public.departments where code='PROC';
  select id into d_hr from public.departments where code='HR';
  select id into p1 from public.partners where code='PT-0001';
  select id into p2 from public.partners where code='PT-0004';
  select id into p3 from public.partners where code='PT-0007';
  select id into p4 from public.partners where code='PT-0012';
  select id into p5 from public.partners where code='PT-0014';
  select id into p6 from public.partners where code='PT-0010';
  select id into p7 from public.partners where code='PT-0008';

  select id into admin_id from auth.users limit 1;
  if admin_id is null then
    raise notice 'No auth.users found — skipping owned-record seeds. Sign up a user first, then re-run.';
    return;
  end if;

  insert into public.contracts(title, contract_type, partner_id, department_id, owner_id, start_date, end_date, value_amount, status, sign_date) values
    ('สัญญาบำรุงรักษาระบบ IT ประจำปี 2026','บริการ',p1,d_legal,admin_id,'2026-01-01','2026-12-31',2400000,'active','2025-12-15'),
    ('สัญญาบริการขนส่งสินค้า','บริการ',p2,d_proc,admin_id,'2025-06-01','2026-05-31',5800000,'near_expiry','2025-05-15'),
    ('สัญญาให้บริการอินเทอร์เน็ตองค์กร','บริการ',p3,d_proc,admin_id,'2024-01-01','2026-12-31',1200000,'active','2023-12-20'),
    ('สัญญาเช่าซื้ออุปกรณ์สื่อสาร','เช่าซื้อ',p4,d_proc,admin_id,'2025-04-01','2027-03-31',3200000,'active','2025-03-25'),
    ('สัญญา License Microsoft 365 องค์กร','License',p5,d_proc,admin_id,'2026-02-01','2027-01-31',4500000,'pending_signature',null),
    ('สัญญาบริการรักษาความปลอดภัย','บริการ',p6,d_legal,admin_id,'2025-01-01','2025-12-31',1800000,'expired','2024-12-10'),
    ('สัญญาว่าจ้างที่ปรึกษาด้านภาษี','บริการ',p7,d_legal,admin_id,'2026-01-01','2026-06-30',800000,'active','2025-12-28'),
    ('สัญญาบริการฝึกอบรมพนักงาน','บริการ',p1,d_hr,admin_id,'2026-03-01','2026-08-31',650000,'draft',null),
    ('สัญญาบำรุงรักษาระบบไฟฟ้าและเครื่องปรับอากาศ','บริการ',p2,d_proc,admin_id,'2025-10-01','2026-09-30',2100000,'active','2025-09-15'),
    ('สัญญาซื้อขายเครื่องแม่ข่าย','ซื้อขาย',p5,d_proc,admin_id,'2026-01-15','2026-04-15',3800000,'under_review',null);
end $$;

-- ---------- Quotations ----------
do $$
declare admin_id uuid; d_proc uuid; p1 uuid; p2 uuid; p3 uuid;
begin
  select id into admin_id from auth.users limit 1;
  select id into d_proc from public.departments where code='PROC';
  select id into p1 from public.partners where code='PT-0001';
  select id into p2 from public.partners where code='PT-0003';
  select id into p3 from public.partners where code='PT-0009';
  if admin_id is null then return; end if;

  insert into public.quotations(type, partner_id, department_id, owner_id, title, issue_date, expiry_date, total_amount, status) values
    ('incoming',p1,d_proc,admin_id,'ใบเสนอราคาระบบสำรองข้อมูลบนคลาวด์','2026-01-05','2026-02-05',1250000,'under_review'),
    ('incoming',p2,d_proc,admin_id,'ใบเสนอราคาเครื่องพิมพ์เลเซอร์ 20 เครื่อง','2026-01-10','2026-02-10',480000,'negotiation'),
    ('incoming',p3,d_proc,admin_id,'ใบเสนอราคาอุปกรณ์เครือข่าย','2026-01-12','2026-02-15',890000,'approved'),
    ('outgoing',p1,d_proc,admin_id,'เสนอราคาบริการที่ปรึกษา','2026-01-08','2026-03-08',750000,'submitted'),
    ('incoming',p2,d_proc,admin_id,'ใบเสนอราคางานปรับปรุงระบบ','2025-12-20','2026-01-20',320000,'won'),
    ('incoming',p1,d_proc,admin_id,'ใบเสนอราคา Software License','2025-12-15','2026-01-15',220000,'lost'),
    ('incoming',p3,d_proc,admin_id,'ใบเสนอราคา UPS สำรองไฟ','2026-01-14','2026-02-14',145000,'draft'),
    ('outgoing',p2,d_proc,admin_id,'เสนอราคาโครงการปี 2026','2026-01-03','2026-04-03',5500000,'negotiation'),
    ('incoming',p1,d_proc,admin_id,'ใบเสนอราคาต่ออายุ Support ประจำปี','2025-11-20','2026-01-31',680000,'expired'),
    ('incoming',p2,d_proc,admin_id,'ใบเสนอราคาเฟอร์นิเจอร์สำนักงาน','2026-01-11','2026-03-11',385000,'approved'),
    ('incoming',p3,d_proc,admin_id,'ใบเสนอราคา Firewall Appliance','2026-01-13','2026-02-28',550000,'submitted'),
    ('incoming',p1,d_proc,admin_id,'ใบเสนอราคาอบรมพนักงาน','2026-01-09','2026-03-09',195000,'converted_to_contract'),
    ('outgoing',p3,d_proc,admin_id,'เสนอราคาโครงการวิเคราะห์ข้อมูล','2026-01-06','2026-04-06',1850000,'submitted'),
    ('incoming',p2,d_proc,admin_id,'ใบเสนอราคาระบบกล้องวงจรปิด','2026-01-04','2026-02-04',620000,'rejected'),
    ('incoming',p1,d_proc,admin_id,'ใบเสนอราคา Anti-Virus องค์กร','2026-01-02','2026-02-28',145000,'approved');
end $$;

-- ---------- Procurements ----------
do $$
declare admin_id uuid; d_proc uuid; p1 uuid;
begin
  select id into admin_id from auth.users limit 1;
  select id into d_proc from public.departments where code='PROC';
  select id into p1 from public.partners where code='PT-0001';
  if admin_id is null then return; end if;
  insert into public.procurements(title, procurement_type, department_id, requester_id, owner_id, budget, estimated_value, procurement_method, supplier_id, request_date, need_date, status) values
    ('จัดซื้อเซิร์ฟเวอร์ทดแทน 2 เครื่อง','จัดซื้อ',d_proc,admin_id,admin_id,800000,750000,'e-Bidding',p1,'2026-01-05','2026-03-31','vendor_comparison'),
    ('จ้างบริการทำความสะอาดสำนักงาน','จัดจ้าง',d_proc,admin_id,admin_id,1200000,1150000,'เฉพาะเจาะจง',p1,'2026-01-08','2026-02-28','approved'),
    ('จัดซื้อโน้ตบุ๊ก 30 เครื่อง','จัดซื้อ',d_proc,admin_id,admin_id,1500000,1380000,'e-Bidding',null,'2026-01-10','2026-04-15','rfq'),
    ('จ้างพัฒนา Mobile App','จัดจ้าง',d_proc,admin_id,admin_id,3500000,3200000,'คัดเลือก',null,'2026-01-12','2026-06-30','pending_approval'),
    ('จัดซื้อกระดาษถ่ายเอกสาร','จัดซื้อ',d_proc,admin_id,admin_id,180000,165000,'ตกลงราคา',p1,'2026-01-15','2026-02-15','in_progress'),
    ('จ้างที่ปรึกษาด้าน Compliance','จัดจ้าง',d_proc,admin_id,admin_id,900000,850000,'คัดเลือก',null,'2025-12-20','2026-01-31','contracting'),
    ('จัดซื้อ Software License ต่ออายุ','จัดซื้อ',d_proc,admin_id,admin_id,2500000,2400000,'เฉพาะเจาะจง',p1,'2025-11-15','2026-01-01','delivered'),
    ('จ้างซ่อมบำรุงระบบปรับอากาศ','จัดจ้าง',d_proc,admin_id,admin_id,450000,420000,'ตกลงราคา',p1,'2026-01-18','2026-02-05','draft'),
    ('จัดซื้ออุปกรณ์เครื่องเขียน','จัดซื้อ',d_proc,admin_id,admin_id,85000,78000,'ตกลงราคา',p1,'2026-01-20','2026-02-10','completed'),
    ('จ้างจัดงานสัมมนาประจำปี','จัดจ้าง',d_proc,admin_id,admin_id,650000,620000,'คัดเลือก',null,'2025-12-01','2025-12-30','overdue');
end $$;

-- ---------- Documents (25) ----------
do $$
declare admin_id uuid; d_proc uuid; d_hr uuid; d_fin uuid; d_legal uuid;
  c_con uuid; c_quo uuid; c_pol uuid; c_min uuid; c_lic uuid; c_hr uuid;
  p1 uuid; p2 uuid; i int;
begin
  select id into admin_id from auth.users limit 1;
  if admin_id is null then return; end if;
  select id into d_proc from public.departments where code='PROC';
  select id into d_hr from public.departments where code='HR';
  select id into d_fin from public.departments where code='FIN';
  select id into d_legal from public.departments where code='LEGAL';
  select id into c_con from public.document_categories where code='CON';
  select id into c_quo from public.document_categories where code='QUO';
  select id into c_pol from public.document_categories where code='POL';
  select id into c_min from public.document_categories where code='MIN';
  select id into c_lic from public.document_categories where code='LIC';
  select id into c_hr from public.document_categories where code='HR';
  select id into p1 from public.partners where code='PT-0001';
  select id into p2 from public.partners where code='PT-0002';

  for i in 1..25 loop
    insert into public.documents(title, category_id, department_id, owner_id, partner_id, status, confidentiality, value_amount, effective_date, end_date, keywords)
    values (
      case (i % 6)
        when 0 then 'สัญญาซื้อขาย/บริการ ฉบับที่ ' || i
        when 1 then 'ใบเสนอราคา — โครงการ ' || i
        when 2 then 'นโยบายบริษัท ฉบับที่ ' || i
        when 3 then 'รายงานการประชุมคณะกรรมการ ' || i
        when 4 then 'ใบอนุญาต/หนังสือรับรอง ' || i
        else 'เอกสารฝ่ายบุคคล ฉบับที่ ' || i
      end,
      case (i % 6) when 0 then c_con when 1 then c_quo when 2 then c_pol when 3 then c_min when 4 then c_lic else c_hr end,
      case (i % 4) when 0 then d_proc when 1 then d_hr when 2 then d_fin else d_legal end,
      admin_id,
      case when i % 3 = 0 then p1 when i % 3 = 1 then p2 else null end,
      (array['draft','active','under_review','active','approved','archived'])[(i % 6) + 1]::public.document_status,
      (array['public','internal','confidential','highly_confidential'])[(i % 4) + 1]::public.confidentiality_level,
      case when i % 3 = 0 then null else (100000 + i * 15000)::numeric(18,2) end,
      current_date - (i * 15),
      current_date + (30 - i * 3),
      'sample seed data'
    );
  end loop;
end $$;

-- ---------- Notifications + admin role for first user ----------
do $$
declare uid uuid;
begin
  select id into uid from auth.users limit 1;
  if uid is null then return; end if;
  insert into public.notifications(user_id, title, body, type) values
    (uid,'สัญญาใกล้หมดอายุ','สัญญา CON-2025-0002 จะหมดอายุใน 15 วัน','contract_expiring'),
    (uid,'ใบเสนอราคารออนุมัติ','มีใบเสนอราคา 3 รายการรอการพิจารณา','quotation_pending'),
    (uid,'งานเกินกำหนด','งานจัดจ้าง PRC-2025-0010 เกินกำหนดแล้ว 5 วัน','procurement_overdue'),
    (uid,'เอกสารใหม่ได้รับมอบหมาย','คุณได้รับมอบหมายให้ดูแลเอกสาร DOC-2026-0015','assignment'),
    (uid,'ยินดีต้อนรับสู่ Document Hub','เริ่มต้นใช้งานระบบบริหารเอกสารและสัญญาองค์กร','welcome');
  insert into public.user_roles(user_id, role) values (uid,'super_admin') on conflict do nothing;
end $$;
