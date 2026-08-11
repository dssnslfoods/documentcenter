วัตถุประสงค์ของคุณ: ติดตามสถานะโครงการ (Project status tracking) สำหรับ ผู้บริหาร หัวหน้าแผนก และเจ้าหน้าที่ โดยมีเวลา 1-2 เดือน

ผมสรุปสภาพปัจจุบันก่อนนำเสนอ:

1. ระบบมีตาราง project_history สำหรับบันทึกการแก้ไขโครงการแล้ว แต่ยังไม่มี trigger สร้าง notifications อัตโนมัติ
2. หน้า Dashboard มี KPI สั้น + Upcoming Milestones (30 วัน) + Pipeline chart แล้ว
3. หน้า Reports มี Win/Loss, สถานะสัญญา, เอกสารแยกหมวดหมู่ แล้ว
4. มี project_tasks + calendar แล้ว แต่ยังไม่มีสัญญาณเตือน milestone / task ใกล้ครบกำหนดหรือเลยกำหนด
5. สิทธิ: super_admin / management เห็นราคา, dept_head/staff เห็น timeline และไม่เห็นเงิน
6. โครงการ completed จะถูกล็อกการแก้ไขแล้ว

---

ข้อเสนอฟังก์ชันที่เป็นประโยชน์ เรียงตามความเหมาะสมกับเป้าหมาย "ติดตามสถานะโครงการ"

## 1. Project Health / RAG Status (แนะนำเป็นอันดับแรก)

คำอธิบาย: ระบบคำนวณสถานะสุขภาพโครงการอัตโนมัติ จาก progress vs timeline กับ due date ของ task / milestone
- แสดง badge สีเขียว/เหลือง/แดงใน Card โครงการและหน้า Dashboard
- ผู้บริหารเห็น overview ทั้งหมด หัวหน้าแผนกเห็นเฉพาะโครงการที่ตนเกี่ยวข้อง
- ใช้ข้อมูล project_tasks.progress + due_date ที่มีอยู่แล้ว ไม่ต้องเก็บใหม่

สิ่งที่ต้องทำ:
- เพิ่มฟิลด์ virtual / computed หรือ view สำหรับ RAG calculation
- ปรับ project card และ dashboard KPI ให้แสดง RAG

ประโยชน์: ผู้บริหารเห็นภาพรวมทันทีว่าโครงการไหนกำลังเสี่ยง

## 2. Automated Alerts & Notifications (แนะนำเป็นอันดับ 2)

คำอธิบาย: ระบบสร้าง notifications อัตโนมัติเมื่อเกิดเหตุการณ์สำคัญ
- ใกล้ถึงกำหนดส่งมอบ (milestone / task due date) ล่วงหน้า 7, 3, 1 วัน
- เลยกำหนด
- สถานะโครงการเปลี่ยน (เช่น draft -> rfq_sent, won -> in_progress)
- มีการแก้ไขโครงการที่ผู้บริหังเกี่ยวข้อง
- โครงการ completed (summary notification)

สิ่งที่ต้องทำ:
- สร้าง PostgreSQL function + trigger หรือ scheduled cron job (pg_cron) สร้าง rows ใน notifications
- อาจใช้ Supabase cron หรือ external scheduler เรียก /api/public/cron/daily-check
- ปรับหน้า notifications ให้ mark as read ได้ และแสดง badge จำนวน unread ที่ app-shell

ประโยชน์: ลดการต้องมาเปิดหน้าโครงการเอง ระบบบอกเองว่ามีอะไรต้องติดตาม

## 3. Executive Dashboard v2 (Project Status Snapshot)

คำอธิบาย: สร้างหน้า Dashboard ที่ปรับให้เหมาะกับแต่ละบทบาทมากขึ้น
- ผู้บริหาร: ภาพรวม RAG + โครงการที่กำลังเสี่ยง + มูลค่าโครงการรวม
- หัวหน้าแผนก: โครงการที่ต้องดู timeline + task ที่ใกล้ครบกำหนด
- เจ้าหน้าที่: task ของตัวเอง + โครงการที่เป็นสมาชิก

สิ่งที่ต้องทำ:
- ปรับ dashboard.tsx ให้ query แยกตาม role
- เพิ่มส่วน "โครงการที่ต้องติดตามด่วน" (top 5 at-risk)

ประโยชน์: แต่ละคนเห็นข้อมูลที่ต้องใช้จริง ไม่รกเกินไป

## 4. Milestone & Task Delay Tracking

คำอธิบาย: บันทึกประวัติการเลื่อนกำหนด milestone / task
- เมื่อมีการเปลี่ยน due_date ของ task หรือ milestone ให้บันทึก old/new date + เหตุผล
- แสดงใน history tab ของโครงการ

สิ่งที่ต้องทำ:
- เพิ่มตาราง project_task_history หรือ milestone_history
- หรือใช้ project_history ที่มีอยู่แล้ว โดยเพิ่ม action type "task_delay"

ประโยชน์: รู้ว่าโครงการเลื่อนมากี่ครั้ง ทำไมเลื่อน

## 5. Project Status Report Export (PDF/Excel)

คำอธิบาย: ส่งออกรายงานสถานะโครงการเป็น Excel หรือ PDF สำหรับประชุม
- รายงานรวม: โครงการทั้งหมดตามสถานะ + RAG + มูลค่า
- รายงานรายโครงการ: timeline, milestones, เอกสาร, สมาชิก

สิ่งที่ต้องทำ:
- เพิ่มปุ่ม Export ในหน้า Reports และหน้าโครงการ
- ใช้ xlsxwriter หรือ library สร้าง Excel ฝั่ง server (สำหรับรูปเล่ม)
- สำหรับ PDF อาจใช้ print stylesheet หรือ external service

ประโยชน์: เอาไปนำเสนอผู้บริหาร / ประชุมได้ทันที

## 6. Activity Feed แบบ Real-time (Supabase Realtime)

คำอธิบาย: แสดงกิจกรรมล่าสุดของโครงการในหน้าโครงการและ dashboard
- แสดงเมื่อมีการเปลี่ยนสถานะ, อัปโหลดเอกสาร, แก้ไข task, ความคิดเห็นใหม่

สิ่งที่ต้องทำ:
- เปิดใช้ Supabase realtime channel
- สร้าง component ActivityFeed ที่ subscribe ตาราง project_history / notifications

ประโยชน์: ทีมเห็นความเคลื่อนไหวทันที ไม่ต้อง refresh หน้า

## 7. Comment / Note per Project (Status Notes)

คำอธิบาย: ให้ผู้บริหารและหัวหน้าแผนกเพิ่มความคิดเห็น/บันทึกสถานะในโครงการได้
- เช่น "รอลูกค้าตอบกลับ", "ประสานงาน supplier ล่าช้า"
- แสดงใน history tab หรือ tab ใหม่ "บันทึกสถานะ"

สิ่งที่ต้องทำ:
- เพิ่มตาราง project_status_notes
- สร้าง UI แบบง่าย สำหรับเพิ่ม/ดูหมายเหตุ

ประโยชน์: คนมาใหม่เข้าใจสถานะโครงการได้ทันที ไม่ต้องถาม

## 8. Task Assignment & My Tasks Page

คำอธิบาย: หน้า "งานของฉัน" รวม task จากทุกโครงการที่ user ถูก assign
- แสดง task ที่กำลังทำ / ใกล้ครบกำหนด / เลยกำหนด
- สามารถ update progress ได้จากหน้านี้

สิ่งที่ต้องทำ:
- สร้าง route /my-tasks
- query project_tasks ที่ assignee = user ปัจจุปัน

ประโยชน์: เจ้าหน้าที่เห็นงานของตัวเองรวมในที่เดียว

## 9. Project Document Checklist (Completion Tracker)

คำอธิบาย: แสดง checklist เอกสารที่ควรมีในแต่ละ phase ของโครงการ
- เช่น phase RFQ ควรมี spec, phase Supplier ควรมี quotation, phase Execution ควรมี contract
- แสดง % ความสมบูรณ์ของเอกสารในโครงการ

สิ่งที่ต้องทำ:
- กำหนด document template ตาม phase (hard-coded config หรือ master data)
- สร้าง progress bar ใน project card / detail

ประโยชน์: รู้ว่าโครงการขาดเอกสารสำคัญอะไรบ้าง

## 10. External Project Timeline Share / Public Status Page

คำอธิบาย: สร้างหน้าสาธารณะแบบ read-only สำหรับแชร์สถานะโครงการให้ลูกค้าหรือ stakeholder ภายนอกดู
- แสดงเฉพาะข้อมูลที่อนุญาต (ชื่อโครงการ, phase, progress, milestone หลัก)
- ไม่แสดงราคา/เอกสารสัญญา

สิ่งที่ต้องทำ:
- สร้าง route /projects/public/:token
- ใช้ token-based access (ไม่ต้อง login)
- เก็บ public_share_token ในตาราง projects

ประโยชน์: ลูกค้าติดตามความคืบหน้าได้เอง ลดการถามสถานะ

---

ลำดับความสำคัญที่แนะนำ (เท่ากับ 1-2 เดือน)

Phase 1 (สัปดาห์ 1-2): ทำ 1 + 2 + 3
- Project Health / RAG
- Automated Alerts
- Executive Dashboard v2

Phase 2 (สัปดาห์ 3-5): ทำ 4 + 7 + 8
- Delay Tracking
- Status Notes
- My Tasks

Phase 3 (สัปดาห์ 6-8): ทำ 5 + 6 + 9 + 10
- Export Report
- Realtime Activity Feed
- Document Checklist
- Public Status Page

---

หมายเหตุ: ฟังก์ชันทั้งหมดนี้ใช้ฐานข้อมูลและสิทธิที่มีอยู่แล้วเป็นหลัก ไม่ต้อง redesign ระบบหลัก ยกเว้นเพิ่มตาราง/ฟิลด์บางส่วน สามารถเลือกทำเฉพาะที่ต้องการก่อนได้
