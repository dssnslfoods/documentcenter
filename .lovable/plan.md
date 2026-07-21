
# แผนการสร้าง Corporate Document & Contract Hub (Phase 1 + Phase 2)

## 1. Setup & Supabase Connection
- ขอ credentials จากคุณผ่าน secure form: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key)
- สร้าง `src/lib/supabase.ts` client อ่านค่าจาก `import.meta.env`
- ไม่มี hardcoded URL/keys ใน source code
- ส่งมอบ SQL migration files ใน `supabase/migrations/` ให้คุณรันเองบน Supabase dashboard (Lovable ไม่ต่อ external Supabase อัตโนมัติได้)

## 2. Database Schema (SQL migration พร้อมใช้จริง)
ครอบคลุมทุก table ที่ spec ระบุตั้งแต่ต้น เพื่อรองรับ Phase 3–5 ในอนาคต:

`profiles, departments, roles, permissions, user_roles, document_categories, documents, document_files, document_versions, tags, document_tags, contracts, contract_milestones, quotations, quotation_items, procurements, procurement_vendors, partners, partner_contacts, projects, approval_workflows, approval_steps, approval_requests, approval_actions, reminders, calendar_events, notifications, notification_logs, comments, favorites, saved_searches, audit_logs, system_settings, document_number_sequences`

รายละเอียด:
- UUID PK ทุก table, `created_at/updated_at` + triggers, `created_by/updated_by`, soft-delete `archived_at/deleted_at`
- Enums: `app_role` (super_admin, management, dept_manager, staff, viewer), `confidentiality_level`, `document_status`, `contract_status`, `quotation_status`, `procurement_status`, `approval_action_type`
- Foreign keys + indexes ทุก FK และ field ที่ค้นบ่อย (status, dept_id, partner_id, end_date, tsvector)
- Unique constraint บนเลขเอกสาร (partial unique where not archived)
- Full-text search column (`tsvector` + GIN index) บน documents/contracts/quotations
- `has_role(uuid, app_role)` security definer function — role เก็บใน `user_roles` แยกจาก profiles
- RLS เปิดครบ + policies ครอบคลุม: dept-scope, owner-scope, management cross-dept, audit_logs append-only
- Trigger สำหรับ auto-numbering (CON-2026-0001, QUO-, PRC-, DOC-)
- Trigger auto-create profile บน signup
- Storage bucket `documents` (private) + storage.objects policies ผูกกับ `has_role`
- Seed data ภาษาไทยเสมือนจริง (8 users, 5 แผนก, 15 partners, 10 contracts, 15 quotations, 10 procurements, 25 documents, reminders, notifications)

## 3. Design System (Modern Corporate ไทย)
`src/styles.css` ใช้ oklch tokens ตาม palette ที่ระบุ:
- Primary Deep Navy #163F73, Secondary #1F5AA6, Accent Teal #0F766E
- Background #F7F9FC, Surface white
- Success/Warning/Critical tokens
- Typography: Inter + Noto Sans Thai (link tag ใน __root)
- Semantic tokens: `--sidebar`, `--badge-confidential`, `--status-active/expired/warning`
- Custom button/badge variants (hero, sidebar-active, status-*)

## 4. Auth (Phase 1)
- หน้า `/auth` — Sign in / Sign up (email+password), Forgot password
- `/reset-password` — set new password (public route)
- `_authenticated/route.tsx` gate — redirect ไป `/auth`
- Session listener ใน `__root.tsx` → `router.invalidate()`
- Password policy (min 8, uppercase, number)
- Session timeout warning

## 5. Layout & Navigation (Phase 1)
- Collapsible left sidebar (shadcn) พร้อม 13 เมนู (แสดงตาม role)
- Top nav: breadcrumb, global search, notification bell (badge count), user profile dropdown
- Responsive (desktop-first, mobile ใช้ sheet)
- Sample state: loading skeleton, empty state, error state components

## 6. Phase 1 Modules — Foundation
- `/dashboard` — Executive Dashboard: KPI cards (10), charts (Recharts: docs by type/dept, expiring monthly, procurement trend), urgent lists, upcoming, recent activity, filters (ปี/แผนก/สถานะ)
- `/admin/users` — user management (list/invite/edit role/deactivate)
- `/admin/roles` — roles & permissions viewer
- `/admin/departments` — CRUD แผนก
- `/admin/document-categories` — CRUD หมวดหมู่เอกสาร + custom fields
- `/admin/master-data` — tags, projects, workflow templates, numbering formats
- `/admin/audit-log` — ตารางบันทึกกิจกรรม (read-only, filter, export)
- `/profile` — user profile, change password
- `/my-tasks`, `/favorites` — placeholder ใช้จริง

## 7. Phase 2 Modules — Document Repository
- `/documents` — list พร้อม server-side pagination, sort, column selector, advanced filter drawer (category, dept, status, confidentiality, date range, value range, expiring, has attachment), saved searches, export CSV
- `/documents/new`, `/documents/:id/edit` — form แบ่ง section: ข้อมูลหลัก / กำหนดการ / ไฟล์แนบ / สิทธิ์ / tags — validation ครบ (end ≥ start, value ≥ 0)
- `/documents/:id` — detail page: header + status/confidentiality badge, tabs (ข้อมูล / ไฟล์ & versions / กิจกรรม / สิทธิ์ / audit)
- File upload: drag & drop, multi-file, validate type/size, upload ไป Supabase Storage `documents/{dept}/{year}/{type}/{doc_id}/v{n}/`, บันทึก file_hash, signed URL สำหรับ download/preview (PDF/image)
- Version control: อัปโหลด version ใหม่ = สร้าง row ใหม่ใน `document_versions`, ตั้ง current_version_id, ไม่ทับไฟล์เดิม
- Soft delete + restore (admin)
- Global search bar (debounced, ใช้ tsvector)
- Favorites toggle
- Audit logs ทุก view/create/update/upload/download

## 8. Business Rules & Validation
Zod schemas ทุก form, database CHECK constraints, RLS policies บังคับซ้ำ

## 9. Definition of Done
ทุก feature: UI + form validation + DB constraint + RLS + loading/empty/error state + responsive + audit log + ทดสอบ RLS ต่อ role

## Deliverables ที่คุณต้องทำเอง
1. รัน SQL migrations ที่ผมสร้างบน Supabase SQL Editor (ผมจะทำเป็นไฟล์ single-file ให้ copy-paste)
2. สร้าง Storage bucket `documents` (private) — ผมจะรวม SQL ไว้ให้
3. เปิด Email auth ใน Supabase (default เปิดอยู่แล้ว)

## Assumptions (จะระบุใน README)
- Email/password auth เท่านั้นใน Phase 1 (Google/Microsoft ไว้ Phase ถัดไป)
- Notification เฉพาะ in-app (Email/LINE/Teams webhook ไว้ Phase 4)
- OCR/AI Semantic Search ยังไม่ทำ (spec ระบุให้เตรียมโครงสร้างพอ)
- Approval Workflow, Calendar, Reminder Engine, Reports รายละเอียดลึก = Phase 4-5 (spec ให้เริ่ม Phase 1+2 ก่อน)

## ขั้นตอนถัดไป
1. ยืนยันแผนนี้
2. ผมขอ `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` ผ่าน secure form
3. เริ่ม build design system → schema SQL → auth → layout → dashboard → documents module
