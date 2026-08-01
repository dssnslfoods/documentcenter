import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-supabase";
import { useMyRoles } from "@/hooks/use-page-access";

export interface Organization {
  id: string;
  code: string;
  name: string;
  name_en: string | null;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
}

/** true เมื่อผู้ใช้เป็นผู้ดูแลระดับแพลตฟอร์ม (ดูแลได้ทุกองค์กร) */
export function useIsPlatformOwner() {
  const { roles, isLoading } = useMyRoles();
  return { isPlatformOwner: roles.includes("platform_owner"), isLoading };
}

/** องค์กรที่ผู้ใช้สังกัด + องค์กรที่กำลังสลับเข้าไปดู (สำหรับ platform owner) */
export function useMyOrg() {
  const { user } = useAuth();
  const { roles } = useMyRoles();
  const isPlatformOwner = roles.includes("platform_owner");
  return useQuery({
    queryKey: ["my-org", user?.id, isPlatformOwner],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("profiles")
        .select("organization_id, active_organization_id")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) return null;
      const row = data as { organization_id: string | null; active_organization_id: string | null } | null;
      if (!row) return null;
      // ผู้ดูแลแพลตฟอร์ม: อยู่ในองค์กรก็ต่อเมื่อ "สลับ" เข้าไปเท่านั้น (ไม่ fallback ไปองค์กรที่สังกัด)
      const activeId = isPlatformOwner
        ? row.active_organization_id
        : row.active_organization_id ?? row.organization_id;
      let org: Organization | null = null;
      if (activeId) {
        const { data: o } = await getSupabase()
          .from("organizations")
          .select("*")
          .eq("id", activeId)
          .maybeSingle();
        org = (o as Organization) ?? null;
      }
      return { ...row, activeId, org };
    },
  });
}

export function useOrganizations(enabled = true) {
  return useQuery({
    queryKey: ["organizations"],
    enabled,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("organizations")
        .select("*")
        .order("code");
      if (error) throw error;
      return (data ?? []) as Organization[];
    },
  });
}

/** สลับองค์กรที่กำลังดูอยู่ (null = ดูทุกองค์กร) — เฉพาะ platform owner */
export function useSwitchOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orgId: string | null) => {
      const { error } = await getSupabase().rpc("switch_organization", { _org: orgId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}
