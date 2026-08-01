import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { useMyOrg } from "@/lib/org";
import type { PageKey } from "@/lib/pages";

/** เมนูที่องค์กรสามารถเปิดใช้งานได้ (ไม่รวมเมนูระดับแพลตฟอร์ม) */
export const ORG_PAGE_KEYS: PageKey[] = [
  "dashboard", "calendar", "notifications",
  "projects", "quotations", "partners",
  "documents", "contracts",
  "reports", "audit-log", "settings",
];

export interface OrgPageAccessRow {
  organization_id: string;
  page_key: string;
  enabled: boolean;
}

/** แถวสิทธิ์เมนูขององค์กรทั้งหมด (สำหรับหน้าผู้ดูแลแพลตฟอร์ม) */
export function useAllOrgPageAccess(enabled = true) {
  return useQuery({
    queryKey: ["organization-page-access"],
    enabled,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("organization_page_access")
        .select("organization_id, page_key, enabled");
      if (error) return [] as OrgPageAccessRow[];
      return (data ?? []) as OrgPageAccessRow[];
    },
  });
}

export function useSetOrgPageAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { organizationId: string; pageKey: string; enabled: boolean }) => {
      const { error } = await getSupabase()
        .from("organization_page_access")
        .upsert(
          { organization_id: input.organizationId, page_key: input.pageKey, enabled: input.enabled },
          { onConflict: "organization_id,page_key" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organization-page-access"] });
      qc.invalidateQueries({ queryKey: ["my-org-page-access"] });
    },
  });
}

/** เมนูที่เปิดให้องค์กรของผู้ใช้ปัจจุบัน — ใช้กรองเมนูใน sidebar */
export function useMyOrgPageAccess() {
  const { data: myOrg } = useMyOrg();
  const orgId = myOrg?.activeId ?? null;
  const q = useQuery({
    queryKey: ["my-org-page-access", orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("organization_page_access")
        .select("page_key, enabled")
        .eq("organization_id", orgId!);
      if (error) return [] as { page_key: string; enabled: boolean }[];
      return (data ?? []) as { page_key: string; enabled: boolean }[];
    },
  });
  const orgAllows = (key: PageKey) => {
    const rows = q.data;
    if (!orgId || !rows || rows.length === 0) return true; // ยังไม่ตั้งค่า = เปิดทั้งหมด
    const row = rows.find((r) => r.page_key === key);
    return row ? row.enabled : true;
  };
  return { orgAllows, isLoading: q.isLoading };
}
