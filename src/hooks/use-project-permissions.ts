import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-supabase";
import type { ProjectRole } from "@/lib/project-roles";

export const ALL_PERMISSIONS = [
  "view_project_info",
  "view_spec_scope",
  "view_supplier_quotation",
  "view_supplier_quotation_no_price",
  "view_customer_quotation",
  "view_customer_quotation_no_price",
  "view_contract",
  "view_milestones",
  "view_milestones_no_payment",
  "view_all_documents",
  "edit_project",
  "edit_milestones",
  "upload_documents",
] as const;

export type PermissionKey = (typeof ALL_PERMISSIONS)[number];

export const PERMISSION_LABEL: Record<PermissionKey, string> = {
  view_project_info: "ดูข้อมูลโครงการ",
  view_spec_scope: "ดู RFQ / Spec / TOR",
  view_supplier_quotation: "ดูใบเสนอ Supplier (เห็นราคา)",
  view_supplier_quotation_no_price: "ดูใบเสนอ Supplier (ซ่อนราคา)",
  view_customer_quotation: "ดูใบเสนอลูกค้า (เห็นราคา)",
  view_customer_quotation_no_price: "ดูใบเสนอลูกค้า (ซ่อนราคา)",
  view_contract: "ดูสัญญา",
  view_milestones: "ดูงวดงาน (เห็นยอด)",
  view_milestones_no_payment: "ดูงวดงาน (ซ่อนยอด)",
  view_all_documents: "ดูเอกสารทั้งหมด",
  edit_project: "แก้ไขโครงการ",
  edit_milestones: "แก้ไขงวดงาน",
  upload_documents: "อัปโหลดเอกสาร",
};

export type ProjectPermissions = {
  isAdmin: boolean;
  isManager: boolean;
  isMember: boolean;
  /** โครงการปิดแล้ว — ล็อกการแก้ไขทั้งหมด */
  isLocked: boolean;
  projectRole: ProjectRole | null;
  keys: Set<PermissionKey>;
  has: (k: PermissionKey) => boolean;
  // Derived UI gates
  canManageTeam: boolean;
  canSeeOverview: boolean;
  canSeeSpec: boolean;
  canSeeSupplier: boolean;
  canSeeSupplierPrice: boolean;
  canSeeCustomer: boolean;
  canSeeCustomerPrice: boolean;
  canSeeContract: boolean;
  canSeeMilestones: boolean;
  canSeeMilestonePayment: boolean;
  canSeeTimeline: boolean;
  canEditTimeline: boolean;
  canEditProject: boolean;
  canEditMilestones: boolean;
  canUpload: boolean;
};

export function useProjectPermissions(projectId: string | undefined): {
  data: ProjectPermissions | undefined;
  isLoading: boolean;
} {
  const sb = getSupabase();
  const { user } = useAuth();

  const q = useQuery({
    queryKey: ["project-perms", projectId, user?.id],
    enabled: !!projectId && !!user,
    queryFn: async (): Promise<ProjectPermissions> => {
      const uid = user!.id;
      const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", uid);
      const roleList = (roles ?? []).map((r) => r.role as string);
      const isAdmin = roleList.includes("super_admin");
      // Only super_admin / management may act as project executives.
      const canBeExec = isAdmin || roleList.includes("management");

      const { data: proj } = await sb
        .from("projects")
        .select("status")
        .eq("id", projectId!)
        .maybeSingle();
      const isLocked = ((proj as { status?: string } | null)?.status ?? "") === "completed";

      const { data: mem } = await sb
        .from("project_members")
        .select("id, project_role")
        .eq("project_id", projectId!)
        .eq("user_id", uid)
        .maybeSingle();

      const memberRole = ((mem as { project_role?: string } | null)?.project_role ?? null) as ProjectRole | null;
      const projectRole: ProjectRole | null = isAdmin
        ? "exec"
        : memberRole ?? (canBeExec ? "exec" : null);

      const keys = new Set<PermissionKey>();
      if (mem) {
        const { data: perms } = await sb
          .from("project_member_permissions")
          .select("permission_key, granted")
          .eq("project_member_id", mem.id);
        (perms ?? []).forEach((p) => {
          if (p.granted) keys.add(p.permission_key as PermissionKey);
        });
      }

      const isExec = projectRole === "exec";
      const has = (k: PermissionKey) => isAdmin || isExec || keys.has(k);

      // Price visibility is never auto-granted: admins can hide it per member.
      const priceSet = (priceKey: PermissionKey, noPriceKey: PermissionKey) => {
        if (isAdmin) return true;
        if (keys.has(priceKey)) return true;
        if (keys.has(noPriceKey)) return false;
        return isExec;
      };

      const timelineOnly = projectRole === "dept_head" || projectRole === "staff";

      if (timelineOnly) {
        const canEditTimeline = projectRole === "dept_head" && !isLocked;
        return {
          isAdmin: false,
          isManager: false,
          isMember: !!mem,
          isLocked,

          projectRole,
          keys,
          has: () => false,
          canManageTeam: false,
          canSeeOverview: false,
          canSeeSpec: false,
          canSeeSupplier: false,
          canSeeSupplierPrice: false,
          canSeeCustomer: false,
          canSeeCustomerPrice: false,
          canSeeContract: false,
          canSeeMilestones: false,
          canSeeMilestonePayment: false,
          canSeeTimeline: true,
          canEditTimeline,
          canEditProject: false,
          canEditMilestones: false,
          canUpload: false,
        };
      }

      const seeCustomerPrice = priceSet("view_customer_quotation", "view_customer_quotation_no_price");
      const seeSupplierPrice = priceSet("view_supplier_quotation", "view_supplier_quotation_no_price");
      const seeMilestonePayment = priceSet("view_milestones", "view_milestones_no_payment");
      const seeSupplier = has("view_supplier_quotation") || has("view_supplier_quotation_no_price");
      const seeCustomer = has("view_customer_quotation") || has("view_customer_quotation_no_price");
      const seeMilestones = has("view_milestones") || has("view_milestones_no_payment");

      // Admin / management who are NOT project members: read-only access.
      const outsider = !mem && (isAdmin || canBeExec);

      return {
        isAdmin,
        isManager: isExec,
        isMember: !!mem,
        projectRole,
        keys,
        has,
        canManageTeam: !outsider && (isAdmin || isExec),
        canSeeOverview: isAdmin || has("view_project_info") || !!mem,
        canSeeSpec: has("view_spec_scope") || has("view_all_documents"),
        canSeeSupplier: seeSupplier,
        canSeeSupplierPrice: seeSupplierPrice,
        canSeeCustomer: seeCustomer,
        canSeeCustomerPrice: seeCustomerPrice,
        canSeeContract: has("view_contract") || has("view_all_documents"),
        canSeeMilestones: seeMilestones,
        canSeeMilestonePayment: seeMilestonePayment,
        canSeeTimeline: isAdmin || isExec || seeMilestones,
        canEditTimeline: !outsider && (isAdmin || isExec || has("edit_milestones")),
        canEditProject: !outsider && has("edit_project"),
        canEditMilestones: !outsider && has("edit_milestones"),
        canUpload: !outsider && has("upload_documents"),
      };

    },
  });

  return { data: q.data, isLoading: q.isLoading };
}
