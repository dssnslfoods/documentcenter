import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSupabase } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/audit-log")({
  head: () => ({ meta: [{ title: "Audit Log | Document Hub" }] }),
  component: AuditLog,
});

function AuditLog() {
  const { data, isLoading } = useQuery({
    queryKey: ["audit-log-all"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("audit_logs")
        .select("*, profiles(full_name, email)")
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" description="บันทึกกิจกรรมสำคัญทั้งหมดในระบบ (Read-only, Append-only)" />
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-muted/60" />)}</div>
          ) : data && data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="border-b bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">เวลา</th>
                    <th className="px-4 py-3">ผู้ใช้งาน</th>
                    <th className="px-4 py-3">Module</th>
                    <th className="px-4 py-3">กิจกรรม</th>
                    <th className="px-4 py-3">Record ID</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((a: any) => {
                    const prof = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles;
                    return (
                      <tr key={a.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-3 font-mono text-xs">{fmtDateTime(a.created_at)}</td>
                        <td className="px-4 py-3">{prof?.full_name ?? prof?.email ?? "ระบบ"}</td>
                        <td className="px-4 py-3"><Badge variant="outline">{a.module}</Badge></td>
                        <td className="px-4 py-3">{a.action}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{a.record_id?.slice(0, 8) ?? "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">ยังไม่มีบันทึกกิจกรรม</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
