# Corporate Document & Contract Hub

**ระบบบริหารโครงการ–เอกสาร–สัญญาองค์กร (Project-Centric)** — ทุก workflow ผูกกับ "โครงการ" หนึ่งใบเสมอ: RFQ/Spec, ใบเสนอราคา supplier, ใบเสนอราคาลูกค้า, สัญญา, งวดงาน, แผนงาน (Gantt), การมอบหมายงาน, เอกสารแนบ และประวัติการแก้ไข

Built with React 19 + TanStack Start v1 + TypeScript + Tailwind v4 + shadcn/ui + **External Supabase** (Multi-tenant)

> เดิมชื่อ "Document Hub" (เอกสารเป็นศูนย์กลาง) — re-architect เป็น Project-Centric ตั้งแต่ migration `0006` และรองรับหลายองค์กร (Multi-tenant) ตั้งแต่ `0040`–`0051`
> ดูรายละเอียดขอบเขตระบบฉบับเต็มได้ที่เอกสารส่งมอบระบบ (System Handover)

---

## 📦 ฟีเจอร์หลัก

- **โครงการ (Project)** — lifecycle 7 เฟส (`draft → rfq_sent → quotation_received → proposal_submitted → won → in_progress → completed` หรือ `lost`), งานผลิตภายใน (in-house) ข้าม 2 เฟสแรกได้, RAG health (green/yellow/red/grey) คำนวณอัตโนมัติ, ล็อกแก้ไขเมื่อ `completed`
- **8 แท็บในหน้าโครงการ** — ภาพรวม, RFQ/Spec, ใบเสนอราคา Supplier (AI scan), ใบเสนอราคาลูกค้า (AI scan), สัญญา/งวดงาน, ดำเนินโครงการ (Gantt เขียนเอง), สมาชิกโครงการ, ประวัติการแก้ไข (field-level diff)
- **RBAC สองชั้น** — บทบาทระดับระบบ (`platform_owner` / `super_admin` / `management` / `dept_manager` / `staff`) × บทบาทและสิทธิ์ละเอียดระดับโครงการ (`exec` / `dept_head` / `staff` + permission ต่อฟีเจอร์)
- **Multi-tenant** — แยกข้อมูลตามองค์กร, platform owner ต้อง "สลับเข้า" หรือได้รับ Support Access ชั่วคราวจึงเห็นข้อมูลองค์กร
- **AI Scan ใบเสนอราคา** — อัปโหลดรูป/PDF → Gemini API (เรียกตรง) → เติมฟอร์มอัตโนมัติพร้อม confidence รายฟิลด์
- **การมอบหมายงาน (Task Assignment)** — สถานะ `draft → assigned → acknowledged → in_review → accepted` (แยก `revision` ได้), Kanban board, ไทม์ไลน์พอร์ตโฟลิโอทุกโครงการ
- **VAT, Price masking, AKA ลูกค้า, Calendar, Global smart search (Postgres FTS), Auto code generation, MCP + OAuth** สำหรับ AI agent ภายนอก

หน้า `/documents` และ `/contracts` เป็น **มุมมองรวมแบบ read-only** ของไฟล์/สัญญาที่อัปโหลดผ่านโครงการเท่านั้น — ไม่สามารถสร้างใหม่จากหน้านี้ได้

---

## ⚙️ Tech Stack

| ชั้น | เทคโนโลยี |
| --- | --- |
| Framework | TanStack Start v1 (React 19 + Vite 7, SSR/Edge — Cloudflare Workers runtime) |
| Router | TanStack Router (file-based, `src/routes/`) |
| Data fetching | TanStack Query v5 (`useQuery`/`useMutation`) — ไม่ใช้ route loader สำหรับข้อมูล |
| UI | Tailwind CSS v4 + shadcn/ui + lucide-react |
| Forms | react-hook-form + zod |
| Backend | External Supabase (Postgres + Auth + Storage) |
| Server logic | `createServerFn` (`@tanstack/react-start`) ในไฟล์ `*.functions.ts` |
| AI | Gemini API (เรียกตรง) → `gemini-2.5-flash` |
| Agent | MCP server (`/mcp`) + OAuth 2.1 consent flow |

---

## ⚙️ Setup

### 1) เตรียม External Supabase Project

รันไฟล์ SQL ใน `db/` **ตามลำดับเลข** ใน Supabase SQL Editor ตั้งแต่ `0001_initial_schema.sql` ถึงไฟล์ล่าสุด (ปัจจุบันถึง `0054`) — Lovable ไม่ได้ต่อ external Supabase อัตโนมัติ ต้องรันมือ

ไฟล์เหล่านี้จะสร้างตาราง, Enums, RLS policies ครบทุกตาราง, `has_role()` / multi-tenant helper functions, auto-numbering triggers, storage buckets + policies, full-text search (tsvector + GIN) และ trigger สร้าง `profiles` อัตโนมัติเมื่อสมัครสมาชิก

### 2) ตั้งค่า Secrets

| ชื่อ | ใช้ที่ไหน |
| --- | --- |
| `EXTERNAL_SUPABASE_URL` | server fn `getSupabaseConfig()` |
| `EXTERNAL_SUPABASE_ANON_KEY` | ส่งให้ browser ผ่าน server fn |
| `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY` | `src/lib/supabase-admin.ts` (server only) |
| `GEMINI_API_KEY` | เรียก Gemini API โดยตรง (scan ใบเสนอราคา) |

### 3) เปิด Email Auth ใน Supabase

Supabase Dashboard → Authentication → Providers → Email → เปิด (ค่าเริ่มต้นเปิดอยู่แล้ว)

### 4) สร้างผู้ใช้แรกและองค์กร

1. สมัครผู้ใช้แรกที่ `/auth`
2. Insert `user_roles` ให้เป็น `platform_owner` หรือ `super_admin`
3. สร้างองค์กรที่ `/settings/organizations` (หรือ `/platform`) แล้วผูก `profiles.organization_id`
4. ตั้ง master data: work types, VAT, departments, partners → แล้วสร้างโครงการแรก

---

## 🔐 Security Model

- **RLS เปิดทุกตาราง** — บังคับใช้ที่ database ไม่ใช่แค่ UI, ใช้ `has_role(uuid, app_role)` (SECURITY DEFINER) ในทุก policy
- **Roles อยู่ใน `user_roles` table แยก** ห้ามเก็บใน `profiles` — ป้องกัน privilege escalation
- **Multi-tenant isolation** — ตารางธุรกิจส่วนใหญ่มี `organization_id` + trigger `set_org_id()`; platform owner ไม่เห็นข้อมูลองค์กรใดจนกว่าจะสลับเข้าหรือได้รับ Support Access ชั่วคราว
- **Storage** — เข้าถึงผ่าน signed URL เท่านั้น (10–30 นาที)
- **Anon key ปลอดภัยต่อการเปิดเผย** — การควบคุมสิทธิ์ทำที่ database ผ่าน RLS ทั้งหมด, service role key ไม่ปรากฏใน frontend
- **Audit logs append-only**

## 👥 Roles (`public.app_role`)

| role | ความหมาย | ขอบเขต |
| --- | --- | --- |
| `platform_owner` | ผู้ดูแลแพลตฟอร์ม | ทุกองค์กร, จัดการองค์กร/เมนู/ผู้ดูแลองค์กร |
| `super_admin` | ผู้ดูแลองค์กร | ทั้งองค์กรของตน |
| `management` | ผู้บริหาร | ข้ามแผนกในองค์กร |
| `dept_manager` | หัวหน้าแผนก | โครงการที่ตนเป็นสมาชิก |
| `staff` | พนักงาน | โครงการที่ตนเป็นสมาชิก |

(`viewer` ถูกลบออกใน migration `0042`)

---

## 🗺️ Roadmap / งานที่ยังเปิดอยู่

- Notification ยังเป็น in-app อย่างเดียว (Email / LINE / Teams webhook ยังไม่ทำ)
- OCR/Semantic search เต็มรูปแบบยังไม่ทำ (ปัจจุบันใช้ Postgres FTS + AI scan เฉพาะใบเสนอราคา)
- Reports ยังเป็นสถิติ Win/Loss + สรุปโครงการ ยังไม่มี export ครบทุกมุมมอง (มี `exceljs` ติดตั้งไว้แล้ว)
- SSO (Google/Microsoft) ยังไม่เปิด
- Legacy tables (`procurements`, `approval_workflows` และตารางที่เกี่ยวข้อง) ยังอยู่ในสคีมาแต่ **ไม่ได้ใช้งานแล้ว** — อย่านำ Approvals/Workflow/Procurement/viewer role กลับมาใช้โดยไม่ถาม

---

## 🏗️ Development

```bash
bun install
bun dev              # http://localhost:8080
bun run build        # production build
bun run lint
bun run format
```

## 📁 File tree

```
db/                              # SQL migrations 0001..0054 (รันมือใน Supabase SQL Editor)
src/
├── routes/
│   ├── __root.tsx                # SupabaseBootstrap + AuthStateListener + Toaster
│   ├── index.tsx                 # Landing
│   ├── auth.tsx                  # Sign in / up / forgot password
│   ├── reset-password.tsx
│   ├── mcp.ts, [.mcp]/*, [.well-known]/*, [.]lovable.oauth.consent.tsx
│   ├── api/public/cron/daily-check.ts   # cron: แจ้งเตือนใกล้ครบกำหนด
│   └── _authenticated/
│       ├── route.tsx             # auth gate (ssr:false) + <AppShell>
│       ├── dashboard.tsx  calendar.tsx  notifications.tsx  search.tsx  profile.tsx
│       ├── projects.index.tsx / projects.new.tsx / projects.$id.tsx
│       ├── assignments.execution.tsx / assignments.project.$id.tsx
│       │   / assignments.board.$id.tsx / assignments.history.tsx
│       ├── quotations.* partners.tsx documents.* contracts.* reports.tsx audit-log.tsx
│       ├── platform.index.tsx / platform.admins.tsx / platform.menus.tsx
│       └── settings.{index,users,access,departments,categories,tags,work-types,
│                      vat,general,organizations}.tsx
├── components/
│   ├── app-shell.tsx             # sidebar (menu ตาม RBAC) + topbar + org switcher
│   ├── org-switcher.tsx  settings-nav.tsx  platform-nav.tsx  page-header.tsx
│   ├── status-badge.tsx  partner-form-dialog.tsx  scan-quotation-card.tsx
│   ├── project/                  # หัวใจของระบบ — 8 แท็บของหน้าโครงการ
│   └── ui/                       # shadcn primitives
├── hooks/
│   ├── use-supabase.ts           # useAuth() — session/user
│   ├── use-page-access.tsx       # useMyRoles(), useAccessMatrix(), page guard
│   ├── use-project-permissions.ts
│   └── use-admin-guard.tsx       # guard สำหรับหน้า settings
└── lib/                          # domain logic: project-lifecycle, project-roles,
                                   # project-health, vat, task-assignment, mcp/, ...
```
