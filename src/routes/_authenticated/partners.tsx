import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSupabase } from "@/lib/supabase";

export const Route = createFileRoute("/_authenticated/partners")({
  head: () => ({ meta: [{ title: "คู่ค้าและลูกค้า | Document Hub" }] }),
  component: Partners,
});

function Partners() {
  const { data, isLoading } = useQuery({
    queryKey: ["partners-list"],
    queryFn: async () => {
      const { data } = await getSupabase().from("partners").select("*").order("name");
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="คู่ค้าและลูกค้า" description="ฐานข้อมูลคู่ค้า Supplier และลูกค้าทั้งหมด" />
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-muted/60" />)}
            </div>
          ) : data && data.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-3">รหัส</th><th className="px-4 py-3">ชื่อ</th><th className="px-4 py-3">ประเภท</th><th className="px-4 py-3">เลขผู้เสียภาษี</th><th className="px-4 py-3">อีเมล</th><th className="px-4 py-3">สถานะ</th></tr>
              </thead>
              <tbody>
                {data.map((p: any) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3 font-mono text-xs">{p.code}</td>
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{p.type === "customer" ? "ลูกค้า" : p.type === "supplier" ? "Supplier" : "ทั้งคู่"}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.tax_id ?? "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.email ?? "-"}</td>
                    <td className="px-4 py-3">
                      <Badge className={p.status === "active" ? "bg-success/15 text-success border-0" : "bg-muted text-muted-foreground border-0"}>
                        {p.status === "active" ? "ใช้งาน" : p.status === "inactive" ? "ไม่ใช้งาน" : "บล็อก"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">ยังไม่มีคู่ค้าในระบบ</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
