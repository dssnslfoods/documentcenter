# Project-Centric Document Hub — Rework Plan

Turn the app around so **Project** is the root of every workflow, add per-user/per-project tick-based permissions, and add cross-project Smart Search. Existing modules (Contracts, Quotations, Procurements, Documents) stay accessible but the primary UX becomes the Project lifecycle.

Because this is a large change, I'll ship it in ordered milestones. Each milestone ends in a working app you can test. You approve, I proceed to the next.

---

## Milestone A — Schema & RLS foundation (SQL you run once)

New migration `db/0006_project_centric.sql`:

1. **Extend `projects`**: `customer_name`, `project_type`, `contract_value`, `lost_reason`, `completion_comment`, and expand `status` enum to `draft | rfq_sent | quotation_received | proposal_submitted | won | lost | in_progress | completed`. Keep old statuses mapped (`planning→draft`, `active→in_progress`).
2. **New tables**:
   - `project_members (project_id, user_id, added_by, created_at)` — UNIQUE(project_id, user_id)
   - `project_member_permissions (project_member_id, permission_key text, granted bool)` — UNIQUE(project_member_id, permission_key)
   - `permission_templates (name, permissions jsonb, is_system bool)` + seed 4 system templates (Full / View w/ Price / View no Price / Scope Only)
   - `supplier_quotations (project_id, supplier_id → partners, amount, received_date, notes, file_urls text[])`
   - `customer_quotations (project_id, amount, submitted_date, notes, file_url, is_final)`
   - `project_documents (project_id, document_type enum, name, file_url)` — types: `rfq_spec | tor | contract | final_quotation | other`
   - Extend existing `contract_milestones` OR add `project_milestones` with: `milestone_number, description, due_date, payment_type (percentage|fixed_amount), payment_value, status (pending|completed|postponed|failed), actual_completion_date, postponed_to_date, status_reason, notes`. **Decision**: new `project_milestones` table to avoid conflating with contract-scoped milestones.
3. **Security helper**: `public.has_project_permission(_user uuid, _project uuid, _key text) returns bool` (SECURITY DEFINER) — returns true if user is `super_admin`, or if a matching granted row exists.
4. **RLS**: rewrite policies on `projects`, `project_documents`, `supplier_quotations`, `customer_quotations`, `project_milestones` so a non-admin sees a row only if they're a member. Price-hiding is done in the app layer (SELECT still returns amount; UI masks it) because column-level RLS complicates queries — server helpers return sanitized shapes.
5. **Storage bucket** `project-files` (private) + policies (member-only read, `upload_documents` write).
6. **Grants** on every new public table per Lovable rules.

---

## Milestone B — Auth model & user management

- Extend `profiles` with `role: admin | member` derivation via existing `user_roles` (already present). Rename mental model: `super_admin` = Admin, others = Member.
- New route `/_authenticated/users` (Admin only): list users, invite by email (Supabase admin API via server fn), toggle role, deactivate.
- Header user menu + Profile page already exist; keep.

---

## Milestone C — Project lifecycle UI (the core rework)

Rebuild `projects.$id` as a **Stepper + Tab layout** with these tabs, gated by permissions:

1. **ภาพรวม (Overview)** — basic info, status, contract value, dates, completion comment
2. **Spec & RFQ** — spec text/rich, uploaded RFQ files, supplier selection → "ส่ง RFQ" action moves status to `rfq_sent`
3. **ใบเสนอราคา Supplier** — table + upload form (multi-file), compare view
4. **ใบเสนอราคาลูกค้า** — upload, amount, submit date
5. **ผลการเสนองาน** — Won / Lost buttons (+ lost reason if Lost)
6. **เอกสารสำคัญ** (unlocked when Won) — TOR, Contract, Other; pick existing Customer Quotation as Final or upload new
7. **งวดงาน (Milestones)** — inline-editable table, add/remove rows, status dropdown per row with side-effect fields (actual date / postponed date / reason), progress bar computed from completion
8. **สมาชิก (Members)** — Admin-only Permission Matrix (rows=users, cols=13 permission keys, checkboxes, "Select all", template dropdown)
9. **ปิดโครงการ** — Mark as Completed with confirmation + comment

New page `projects.new` updated to match new fields (customer, type).

Project list: filter by expanded status set, status color badges.

---

## Milestone D — Permission enforcement

- `usePermissions(projectId)` hook → fetches current user's permissions for that project, returns `{ can(key), isAdmin }`.
- Every tab section wraps in `<PermGate keys={[...]}>` — hides (not disables) when denied.
- Price masking helper `<Money value={n} allowed={can('view_supplier_quotation')} />` renders `฿ ••••••` when not allowed.
- Server: for each project fetcher, add a server fn that resolves permissions and strips amount fields before returning to non-privileged users (defense in depth beyond RLS).

---

## Milestone E — Smart Search

New route `/_authenticated/search`:

- Tabs: Milestones / Supplier Quotations / Projects / Documents
- Each tab: filters as spec'd + result table
- Global search bar in header (already exists as concept) → routes to `/search?q=...` with grouped results (Projects / Documents / Suppliers / Milestones)

Dashboard additions: Upcoming Milestones (next 30d), Overdue Milestones (red), status summary cards using new statuses.

---

## Technical notes

- **Stack unchanged**: TanStack Start, external Supabase, TanStack Query, shadcn/ui, Thai UI labels.
- **Legacy modules stay**: Contracts / Quotations / Procurements pages continue to work standalone; they're not deleted. Over time the primary workflow shifts into Projects.
- **Storage**: use existing `getSupabase()` client + new `project-files` bucket; signed URLs for downloads to enforce membership.
- **Migrations you run manually** after each SQL milestone (I'll tell you which file). Milestone A ships one file.
- **Roles**: reuse existing `user_roles` + `has_role` — no new role table.

---

## Suggested order & sizing

| # | Milestone | Files touched | Requires SQL run |
|---|-----------|---------------|------------------|
| A | Schema + RLS + storage bucket | 1 SQL | ✅ yes |
| B | User Management page | ~3 tsx | no |
| C | Project lifecycle tabs + forms | ~8 tsx | no |
| D | Permission hook + gating + masking | ~4 tsx + helpers | no |
| E | Smart Search + Dashboard updates | ~3 tsx | no |

I'll start with **Milestone A** on approval, wait for you to run the SQL and confirm, then continue B→E without stopping unless you want checkpoints between them.

**Two quick questions before I start:**
1. Confirm: create new `project_milestones` table (not reuse `contract_milestones`)?
2. For "invite user by email" — OK to use Supabase Admin API via a server function that requires `super_admin`? (needs service role key in secrets)
