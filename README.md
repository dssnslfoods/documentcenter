# Corporate Document & Contract Hub

**ระบบบริหารเอกสารและสัญญาองค์กร** — เว็บแอปพลิเคชันสำหรับจัดเก็บ ค้นหา ติดตามสถานะ ควบคุมสิทธิ์ และแจ้งเตือนเอกสารและสัญญาสำคัญขององค์กร

Built with React 19 + TanStack Start + TypeScript + Tailwind v4 + shadcn/ui + **External Supabase**

---

## 📦 What's included (Phase 1 + Phase 2)

**Phase 1 — Foundation**
- Authentication (Email/Password, Sign up, Forgot password, Reset)
- Route guards, session listener, sign-out
- Corporate design system (Deep Navy / Teal / Thai typography)
- Responsive layout: collapsible sidebar (13 menu items), top bar, global search, user menu
- Executive Dashboard: 8 KPI cards, 2 charts (Recharts), upcoming contracts table
- Master Data placeholder pages (Users, Departments, Categories, Audit Log, Settings)

**Phase 2 — Document Repository**
- Document list: pagination, filter by status, search by title/no/keyword
- Add / Edit document forms (Zod-validated, multi-section)
- Document detail: 3 tabs (Info / Files & Versions / Audit trail)
- File upload to Supabase Storage with **Version Control** — new file = new row, old versions preserved
- Signed URL download (60s TTL)
- Partner list, Notifications inbox, Audit log viewer

**Placeholder** (Phase 3–5): Contracts UI, Quotations, Procurements, Projects, Calendar, Approvals, Reports. **Database schema พร้อมใช้งานแล้ว** สำหรับทั้งหมดที่ระบุใน spec

---

## ⚙️ Setup — 3 steps

### 1) เตรียม External Supabase Project

1. เข้า Supabase dashboard ของบริษัท → เปิด SQL Editor
2. รันไฟล์ `supabase/migrations/0001_initial_schema.sql` — จะสร้าง:
   - ตาราง 30+ ตาราง, Enums, Indexes, Foreign keys, Constraints
   - `has_role(uuid, app_role)` security-definer function (roles อยู่ในตาราง `user_roles` แยกจาก profiles)
   - RLS policies ครบทุกตาราง — dept-scope, owner-scope, management cross-dept, audit append-only
   - Auto-numbering triggers (CON-2026-0001, QUO-, PRC-, DOC-…)
   - Storage bucket `documents` (private) + storage policies
   - Full-text search (tsvector + GIN index)
   - Auto-create profile trigger เมื่อมีผู้ใช้สมัคร
3. **สมัครผู้ใช้แรกในแอปก่อน** (ผ่านหน้า `/auth`) เพื่อให้มี `auth.users` row
4. รัน `supabase/migrations/0002_seed_data.sql` — จะเพิ่ม 5 แผนก, 15 คู่ค้า, 10 สัญญา, 15 ใบเสนอราคา, 10 procurements, 25 documents, notifications ตัวอย่างภาษาไทย และให้ role `super_admin` แก่ผู้ใช้แรก

### 2) เปิด Email Auth ใน Supabase
Supabase Dashboard → Authentication → Providers → Email → เปิด (ค่าเริ่มต้นเปิดอยู่แล้ว)

**แนะนำ**: ปิด "Confirm email" ระหว่างพัฒนา (Auth → Providers → Email → Confirm email = OFF) หรือใช้ Magic Link แทน

### 3) เชื่อมต่อจาก Lovable
Secrets ที่บันทึกไว้แล้ว:
- `EXTERNAL_SUPABASE_URL` — URL ของ Supabase project
- `EXTERNAL_SUPABASE_ANON_KEY` — Anon (publishable) key

หากต้องการเปลี่ยน ใช้ Secrets settings ของ Lovable

---

## 🔐 Security Model

- **RLS เปิดทุกตาราง** — บังคับใช้ที่ database ไม่ใช่แค่ UI
- **Roles ใน `user_roles` table** — ป้องกัน privilege escalation
- **Storage policies** — Signed URL only, ผูกกับสิทธิ์เอกสารต้นทาง
- **Anon key ปลอดภัยต่อการเปิดเผย** — ทุกการควบคุมสิทธิ์ทำที่ database ผ่าน RLS
- **Service role key ไม่ปรากฏใน frontend** เลย
- **Audit logs append-only** — ผู้ใช้ทั่วไปแก้/ลบไม่ได้

## 👥 Roles

- **super_admin** — จัดการได้ทั้งหมด
- **management** — ดูข้อมูลข้ามแผนกได้
- **dept_manager** — จัดการเอกสารในแผนกตนเอง
- **staff** — สร้าง/แก้เอกสารที่ตนเองรับผิดชอบ (default สำหรับผู้สมัครใหม่)
- **viewer** — read-only

ผู้ใช้แรกที่สมัครและรัน seed จะได้ `super_admin` อัตโนมัติ  
ผู้ใช้ถัดไปได้ `staff` เป็น default (แก้ได้จาก Supabase dashboard: `insert into user_roles(user_id, role) values (...)`)

## 📋 Assumptions ที่ใช้ (จาก spec)

- **Phase 1 + Phase 2 เท่านั้น** — Contracts UI, Quotations UI, Procurements UI, Approval Workflow, Calendar, Reports จะทำใน Phase 3–5 (**Database schema พร้อมรองรับหมดแล้ว**)
- Email/Password auth เท่านั้น (Google/Microsoft/SSO ไว้ Phase ถัดไป)
- Notification เฉพาะ in-app (Email/LINE/Teams webhook = Phase 4)
- OCR / AI Semantic Search ยังไม่ทำ — Phase 1 ใช้ PostgreSQL Full-Text Search (`search_vector` column) และ metadata search แล้ว
- ผู้ใช้จะต้องรัน SQL migrations ด้วยตนเองบน Supabase (Lovable ไม่ต่อ External Supabase อัตโนมัติ)

## 🧪 Definition of Done ที่ครอบคลุมแล้ว

- ✅ UI ทำงานครบสำหรับ Auth + Layout + Dashboard + Documents
- ✅ เชื่อมต่อ Supabase จริงผ่าน runtime config (ไม่ hardcode)
- ✅ Form validation (Zod + react-hook-form)
- ✅ Database constraints + RLS policies
- ✅ Loading / Empty / Error states ทุกหน้า
- ✅ Responsive (desktop-first, mobile sheet)
- ✅ Audit log schema + viewer
- ✅ ไม่มี secret key ใน frontend
- ✅ Placeholder pages ทุกเมนู (ไม่มีปุ่มค้าง)

## 🏗️ Development

```bash
bun install
bun dev              # http://localhost:8080
bun run build        # production build
```

## 📁 File tree

```
src/
├── routes/
│   ├── __root.tsx                       # SupabaseBootstrap + AuthStateListener
│   ├── index.tsx                        # Landing page
│   ├── auth.tsx                         # Sign in / up / forgot
│   ├── reset-password.tsx
│   └── _authenticated/
│       ├── route.tsx                    # Auth gate
│       ├── dashboard.tsx                # Executive Dashboard
│       ├── documents.index.tsx          # Document list
│       ├── documents.new.tsx            # New document form
│       ├── documents.$id.tsx            # Detail + files + audit
│       ├── contracts.tsx (Phase 3)
│       ├── partners.tsx                 # Partner list
│       ├── notifications.tsx
│       ├── audit-log.tsx
│       ├── settings.tsx
│       └── ... (placeholders)
├── components/
│   ├── app-shell.tsx                    # Sidebar + top bar layout
│   ├── page-header.tsx                  # PageHeader + EmptyState
│   └── status-badge.tsx                 # Document/Contract/Confidentiality badges
├── lib/
│   ├── supabase.ts                      # Client singleton
│   ├── supabase-config.functions.ts     # Server fn: returns URL + anon key
│   ├── format.ts                        # Thai date/currency formatters
│   └── types.ts
supabase/migrations/
├── 0001_initial_schema.sql              # 30+ tables, RLS, storage, triggers
└── 0002_seed_data.sql                   # Thai sample data
```
