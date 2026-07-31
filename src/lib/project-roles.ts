import type { AppRole } from "@/lib/types";

/** บทบาทของสมาชิกภายในโครงการ */
export type ProjectRole = "exec" | "dept_head" | "staff";

export const PROJECT_ROLE_LABEL: Record<ProjectRole, string> = {
  exec: "ผู้บริหารโครงการ",
  dept_head: "หัวหน้าแผนก",
  staff: "เจ้าหน้าที่",
};

export const PROJECT_ROLE_DESC: Record<ProjectRole, string> = {
  exec: "สิทธิ์เต็มทั้งโครงการ (เฉพาะผู้ดูแลระบบสูงสุด / ผู้บริหาร)",
  dept_head: "เห็นและแก้ไขแผนงาน (Timeline) เท่านั้น",
  staff: "เห็นแผนงาน (Timeline) อย่างเดียว ไม่สามารถแก้ไขได้",
};

export const PROJECT_ROLES: ProjectRole[] = ["exec", "dept_head", "staff"];

/** เฉพาะบทบาทระบบเหล่านี้เท่านั้นที่สร้างโครงการ / เป็นผู้บริหารโครงการได้ */
export const EXEC_APP_ROLES: AppRole[] = ["super_admin", "management"];

export function canCreateProjects(roles: AppRole[] | undefined) {
  return (roles ?? []).some((r) => EXEC_APP_ROLES.includes(r));
}

/** สิทธิ์ที่ผูกกับบทบาทในโครงการ (ใช้ตอนเพิ่มสมาชิก) */
export const ROLE_PERMISSIONS: Record<ProjectRole, string[]> = {
  exec: [
    "view_project_info", "view_spec_scope", "view_supplier_quotation", "view_customer_quotation",
    "view_contract", "view_milestones", "view_all_documents",
    "edit_project", "edit_milestones", "upload_documents",
  ],
  dept_head: ["view_project_info", "view_milestones", "edit_milestones"],
  staff: ["view_project_info", "view_milestones"],
};
