import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-supabase";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function useAdminGuard() {
  const sb = getSupabase();
  const { user } = useAuth();
  const { data: roles, isLoading } = useQuery({
    queryKey: ["my-roles", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await sb.from("user_roles").select("role").eq("user_id", user!.id);
      return (data ?? []).map((r: { role: string }) => r.role);
    },
  });

  const allowed = !!roles?.includes("super_admin");

  if (!user || isLoading) {
    return {
      allowed: false,
      node: (
        <div className="p-8 text-center text-sm text-muted-foreground">กำลังตรวจสอบสิทธิ์...</div>
      ),
    };
  }

  if (!allowed) {
    return {
      allowed: false,
      node: (
        <div className="space-y-6">
          <PageHeader title="ตั้งค่าระบบ" description="สำหรับผู้ดูแลระบบสูงสุดเท่านั้น" />
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>ไม่มีสิทธิ์เข้าถึง</AlertTitle>
            <AlertDescription>เฉพาะ Super Admin เท่านั้นที่เข้าถึงหน้านี้ได้</AlertDescription>
          </Alert>
        </div>
      ),
    };
  }

  return { allowed: true, node: null as React.ReactNode };
}
