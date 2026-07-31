import type { AppRole } from "@/lib/types";

export type PageKey =
  | "dashboard" | "calendar" | "notifications"
  | "projects" | "quotations" | "partners"
  | "documents" | "contracts"
  | "reports" | "audit-log" | "settings";

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
];

export const ROLES: { value: AppRole; label: string }[] = [
  { value: "super_admin", label: "ผู้ดูแลระบบสูงสุด" },
  { value: "management", label: "ผู้บริหาร" },
  { value: "dept_manager", label: "หัวหน้าแผนก" },
  { value: "staff", label: "พนักงาน" },
  { value: "viewer", label: "ผู้อ่านอย่างเดียว" },
];

/** Fallback matrix used when the role_page_access table has no row (or is missing). */
export const DEFAULT_ACCESS: Record<AppRole, PageKey[]> = {
  super_admin: PAGES.map((p) => p.key),
  management: PAGES.filter((p) => p.key !== "settings").map((p) => p.key),
  // ใบเสนอราคา / คู่ค้าและลูกค้า / รายงาน เปิดเฉพาะผู้ดูแลระบบสูงสุด และผู้บริหาร
  dept_manager: PAGES.filter(
    (p) => !["settings", "audit-log", "quotations", "partners", "reports"].includes(p.key),
  ).map((p) => p.key),
  staff: ["dashboard", "calendar", "notifications", "projects"],
  viewer: ["dashboard", "calendar", "notifications", "projects"],
};

export function defaultAllowed(role: AppRole, key: PageKey) {
  return DEFAULT_ACCESS[role]?.includes(key) ?? false;
}
