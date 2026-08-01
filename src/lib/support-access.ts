import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { useMyOrg, useIsPlatformOwner } from "@/lib/org";

export interface SupportAccessRow {
  organization_id: string;
  enabled: boolean;
  granted_by: string | null;
  granted_at: string | null;
  expires_at: string | null;
  note: string | null;
}

export function isSupportActive(row?: SupportAccessRow | null) {
  if (!row || !row.enabled) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return false;
  return true;
}

/** สิทธิ์สนับสนุนของทุกองค์กร — ใช้ในหน้าผู้ดูแลแพลตฟอร์ม */
export function useAllSupportAccess(enabled = true) {
  return useQuery({
    queryKey: ["support-access-all"],
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("organization_support_access")
        .select("organization_id, enabled, granted_by, granted_at, expires_at, note");
      if (error) return [] as SupportAccessRow[];
      return (data ?? []) as SupportAccessRow[];
    },
  });
}

/** สิทธิ์สนับสนุนขององค์กรที่ผู้ใช้สังกัด — ใช้ในหน้าตั้งค่าระบบของ super_admin */
export function useMySupportAccess() {
  const { data: myOrg } = useMyOrg();
  const orgId = myOrg?.organization_id ?? null;
  const q = useQuery({
    queryKey: ["support-access", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("organization_support_access")
        .select("organization_id, enabled, granted_by, granted_at, expires_at, note")
        .eq("organization_id", orgId!)
        .maybeSingle();
      return (data as SupportAccessRow) ?? null;
    },
  });
  return { orgId, row: q.data ?? null, isLoading: q.isLoading };
}

/** ถอดสิทธิ์ทันที (ปิดสิทธิ์ + เตะผู้ดูแลแพลตฟอร์มออกจากโหมดสนับสนุน) */
export function useRevokeSupportAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { error } = await getSupabase().rpc("revoke_support_access", { _org: organizationId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-access"] });
      qc.invalidateQueries({ queryKey: ["support-access-all"] });
      qc.invalidateQueries({ queryKey: ["support-session"] });
    },
  });
}

export function useSetSupportAccess() {

  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      organizationId: string;
      enabled: boolean;
      expiresAt?: string | null;
      note?: string | null;
      grantedBy?: string | null;
    }) => {
      const { data, error } = await getSupabase()
        .from("organization_support_access")
        .upsert(
          {
            organization_id: input.organizationId,
            enabled: input.enabled,
            expires_at: input.expiresAt ?? null,
            note: input.note ?? null,
            granted_by: input.enabled ? input.grantedBy ?? null : null,
            granted_at: input.enabled ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "organization_id" },
        )
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("บันทึกไม่สำเร็จ — เฉพาะผู้ดูแลองค์กรเท่านั้นที่เปิด/ปิดสิทธิ์นี้ได้");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-access"] });
      qc.invalidateQueries({ queryKey: ["support-access-all"] });
      qc.invalidateQueries({ queryKey: ["support-session"] });
    },
  });
}

/**
 * โหมดสนับสนุนที่กำลังทำงานอยู่:
 * ผู้ดูแลแพลตฟอร์มที่สลับเข้าองค์กร (active_organization_id) และองค์กรนั้นยังเปิดสิทธิ์อยู่
 * เมื่ออยู่ในโหมดนี้จะใช้งานเมนูขององค์กรได้เต็มสิทธิ์
 */
export function useSupportSession() {
  const { isPlatformOwner, isLoading: roleLoading } = useIsPlatformOwner();
  const { data: myOrg, isLoading: orgLoading } = useMyOrg();
  const activeId = myOrg?.active_organization_id ?? null;

  const q = useQuery({
    queryKey: ["support-session", activeId],
    enabled: isPlatformOwner && !!activeId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("organization_support_access")
        .select("organization_id, enabled, granted_by, granted_at, expires_at, note")
        .eq("organization_id", activeId!)
        .maybeSingle();
      return (data as SupportAccessRow) ?? null;
    },
  });

  const active = isPlatformOwner && !!activeId && isSupportActive(q.data);
  return {
    isPlatformOwner,
    active,
    org: myOrg?.org ?? null,
    row: q.data ?? null,
    isLoading: roleLoading || orgLoading || (isPlatformOwner && !!activeId && q.isLoading),
  };
}
