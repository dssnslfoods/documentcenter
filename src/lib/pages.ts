import type { AppRole } from "@/lib/types";

export type PageKey =
  | "dashboard" | "calendar" | "notifications"
  | "projects" | "quotations" | "partners"
  | "documents" | "contracts"
  | "reports" | "audit-log" | "settings" | "organizations";

export const PAGES: { key: PageKey; label: string; to: string; group: string }[] = [
  { key: "dashboard", label: "ภาพรวม", to: "/dashboard", group: "งานประจำวัน" },
  { key: "calendar", label: "ปฏิทิน", to: "/calendar", group: "งานประจำวัน" },
  { key: "notifications", label: "การแจ้งเตือน", to: "/notifications", group: "งานประจำวัน" },
  { key: "projects", label: "โครงการ", to: "/projects", group: "งานขายและโครงการ" },
  { key: "quotations", label: "ใบเสนอราคา", to: "/quotations", group: "งานขายและโครงการ" },
  { key: "partners", label: "คู่ค้าและลูกค้า", to: "/partners", group: "งานขายและโครงการ" },
  { key: "documents", label: "คลังเอกสาร", to: "/documents", group: "เอกสารและสัญญา" },
  { key: "contracts", label: "สัญญา", to: "/contracts", group: "เอกสารและสัญญา" },
  { key: "reports", label: "รายงาน", to: "/reports", group: "กำกับและควบคุม" },
  { key: "audit-log", label: "Audit Log", to: "/audit-log", group: "กำกับและควบคุม" },
  { key: "settings", label: "ตั้งค่าระบบ", to: "/settings", group: "กำกับและควบคุม" },
  { key: "organizations", label: "องค์กร", to: "/settings/organizations", group: "กำกับและควบคุม" },
];

export const ROLES: { value: AppRole; label: string }[] = [
  { value: "platform_owner", label: "ผู้ดูแลแพลตฟอร์ม" },
  { value: "super_admin", label: "ผู้ดูแลองค์กร" },
  { value: "management", label: "ผู้บริหาร" },
  { value: "dept_manager", label: "หัวหน้าแผนก" },
  { value: "staff", label: "พนักงาน" },
];

/** Fallback matrix used when the role_page_access table has no row (or is missing). */
export const DEFAULT_ACCESS: Record<AppRole, PageKey[]> = {
  platform_owner: PAGES.map((p) => p.key),
  super_admin: PAGES.filter((p) => p.key !== "organizations").map((p) => p.key),
  management: PAGES.filter((p) => !["settings", "organizations"].includes(p.key)).map((p) => p.key),
  // ใบเสนอราคา / คู่ค้าและลูกค้า / รายงาน เปิดเฉพาะผู้ดูแลระบบ และผู้บริหาร
  dept_manager: PAGES.filter(
    (p) => !["settings", "organizations", "audit-log", "quotations", "partners", "reports"].includes(p.key),
  ).map((p) => p.key),
  staff: ["dashboard", "calendar", "notifications", "projects"],
};

export function defaultAllowed(role: AppRole, key: PageKey) {
  return DEFAULT_ACCESS[role]?.includes(key) ?? false;
}
