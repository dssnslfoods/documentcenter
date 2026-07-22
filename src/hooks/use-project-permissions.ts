import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-supabase";

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
  isMember: boolean;
  keys: Set<PermissionKey>;
  has: (k: PermissionKey) => boolean;
  // Derived UI gates
  canSeeOverview: boolean;
  canSeeSpec: boolean;
  canSeeSupplier: boolean;
  canSeeSupplierPrice: boolean;
  canSeeCustomer: boolean;
  canSeeCustomerPrice: boolean;
  canSeeContract: boolean;
  canSeeMilestones: boolean;
  canSeeMilestonePayment: boolean;
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
      const isAdmin = (roles ?? []).some((r) => r.role === "super_admin");

      const { data: mem } = await sb
        .from("project_members")
        .select("id")
        .eq("project_id", projectId!)
        .eq("user_id", uid)
        .maybeSingle();

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

      const has = (k: PermissionKey) => isAdmin || keys.has(k);
      const seeSupplier = has("view_supplier_quotation") || has("view_supplier_quotation_no_price");
      const seeCustomer = has("view_customer_quotation") || has("view_customer_quotation_no_price");
      const seeMilestones = has("view_milestones") || has("view_milestones_no_payment");

      return {
        isAdmin,
        isMember: !!mem,
        keys,
        has,
        canSeeOverview: isAdmin || has("view_project_info") || !!mem,
        canSeeSpec: has("view_spec_scope") || has("view_all_documents"),
        canSeeSupplier: seeSupplier,
        canSeeSupplierPrice: isAdmin || has("view_supplier_quotation"),
        canSeeCustomer: seeCustomer,
        canSeeCustomerPrice: isAdmin || has("view_customer_quotation"),
        canSeeContract: has("view_contract") || has("view_all_documents"),
        canSeeMilestones: seeMilestones,
        canSeeMilestonePayment: isAdmin || has("view_milestones"),
        canEditProject: has("edit_project"),
        canEditMilestones: has("edit_milestones"),
        canUpload: has("upload_documents"),
      };
    },
  });

  return { data: q.data, isLoading: q.isLoading };
}
