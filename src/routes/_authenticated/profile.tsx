import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-supabase";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "โปรไฟล์ | Document Hub" }] }),
  component: Profile,
});

function Profile() {
  const { user } = useAuth();
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await getSupabase()
        .from("profiles")
        .select("*, departments(name_th)")
        .eq("id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="โปรไฟล์" description="ข้อมูลบัญชีของคุณ" />
      <Card>
        <CardHeader><CardTitle>ข้อมูลผู้ใช้งาน</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="ชื่อ-นามสกุล" value={profile?.full_name ?? user?.user_metadata?.full_name ?? "-"} />
          <Field label="อีเมล" value={user?.email ?? "-"} />
          <Field label="แผนก" value={(Array.isArray(profile?.departments) ? profile?.departments[0] : profile?.departments)?.name_th ?? "-"} />
          <Field label="ตำแหน่ง" value={profile?.position ?? "-"} />
          <Field label="โทรศัพท์" value={profile?.phone ?? "-"} />
          <Field label="สร้างบัญชีเมื่อ" value={fmtDateTime(user?.created_at)} />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}
