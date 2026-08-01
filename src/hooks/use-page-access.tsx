import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-supabase";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AppRole } from "@/lib/types";
import { defaultAllowed, type PageKey } from "@/lib/pages";
import { useMyOrgPageAccess } from "@/lib/org-access";

export function useMyRoles() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["my-roles", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await getSupabase().from("user_roles").select("role").eq("user_id", user!.id);
      return ((data ?? []) as { role: AppRole }[]).map((r) => r.role);
    },
  });
  return { roles: (q.data ?? []) as AppRole[], isLoading: !user || q.isLoading };
}

/** role -> pageKey -> allowed, from DB. Empty map if the table is missing. */
export function useAccessMatrix() {
  return useQuery({
    queryKey: ["role-page-access"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("role_page_access")
        .select("role, page_key, allowed");
      if (error) return { rows: [] as { role: AppRole; page_key: string; allowed: boolean }[], missing: true };
      return { rows: (data ?? []) as { role: AppRole; page_key: string; allowed: boolean }[], missing: false };
    },
  });
}

export function useCanAccess() {
  const { roles, isLoading: rolesLoading } = useMyRoles();
  const { data, isLoading } = useAccessMatrix();
  const { orgAllows, isLoading: orgLoading } = useMyOrgPageAccess();

  const can = (key: PageKey) => {
    if (roles.length === 0) return false;
    // ผู้ดูแลแพลตฟอร์มใช้เมนูของโซนแพลตฟอร์มเท่านั้น
    if (roles.includes("platform_owner")) return false;
    // องค์กรต้องถูกเปิดใช้เมนูนี้ก่อน จึงจะดูสิทธิ์ระดับบทบาท
    if (!orgAllows(key)) return false;
    return roles.some((role) => {
      const row = data?.rows.find((r) => r.role === role && r.page_key === key);
      return row ? row.allowed : defaultAllowed(role, key);
    });
  };

  return { can, roles, isLoading: rolesLoading || isLoading || orgLoading };
}

/** Guard a page: returns a node to render instead of the page when not allowed. */
export function usePageGuard(key: PageKey, title: string) {
  const { can, isLoading } = useCanAccess();

  if (isLoading) {
    return { allowed: false, node: <div className="p-8 text-center text-sm text-muted-foreground">กำลังตรวจสอบสิทธิ์...</div> };
  }
  if (!can(key)) {
    return {
      allowed: false,
      node: (
        <div className="space-y-6">
          <PageHeader title={title} description="คุณไม่มีสิทธิ์เข้าถึงเมนูนี้" />
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>ไม่มีสิทธิ์เข้าถึง</AlertTitle>
            <AlertDescription>
              เมนูนี้เปิดให้เฉพาะผู้ใช้ระดับผู้จัดการขึ้นไป หรือบทบาทที่ผู้ดูแลระบบกำหนดไว้ใน ตั้งค่าระบบ → สิทธิ์เมนู
            </AlertDescription>
          </Alert>
        </div>
      ),
    };
  }
  return { allowed: true, node: null as React.ReactNode };
}

/**
 * เห็นจำนวนเงินได้เฉพาะ ผู้ดูแลระบบสูงสุด และ ผู้บริหาร เท่านั้น
 * (หัวหน้าแผนกลงไปจะไม่เห็นตัวเลขจำนวนเงินจากทุกหน้าจอ)
 */
export function useCanSeeMoney() {
  const { roles, isLoading } = useMyRoles();
  const canSeeMoney =
    roles.includes("platform_owner") || roles.includes("super_admin") || roles.includes("management");
  return { canSeeMoney, isLoading };
}

/** ข้อความแทนจำนวนเงินเมื่อไม่มีสิทธิ์ */
export const MONEY_MASK = "฿ ••••••";
