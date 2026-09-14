import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users2, Search } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabase } from "@/lib/supabase";
import { PartnerFormDialog, type Partner } from "@/components/partner-form-dialog";
import { usePageGuard } from "@/hooks/use-page-access";

export const Route = createFileRoute("/_authenticated/partners")({
  head: () => ({
    meta: [
      { title: "คู่ค้าและลูกค้า | Document Hub" },
      { name: "description", content: "ฐานข้อมูลคู่ค้า Supplier และลูกค้าสำหรับใช้ในโครงการและใบเสนอราคา" },
    ],
  }),
  component: GuardedPartners,
});

function GuardedPartners() {
  const guard = usePageGuard("partners", "คู่ค้าและลูกค้า");
  if (!guard.allowed) return guard.node;
  return <Partners />;
}

function Partners() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["partners-list"],
    queryFn: async () => {
      const { data, error } = await getSupabase().from("partners").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Partner[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from("partners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ลบแล้ว");
      qc.invalidateQueries({ queryKey: ["partners-list"] });
      qc.invalidateQueries({ queryKey: ["partners-active"] });
    },
    onError: (e: Error) => toast.error("ลบไม่สำเร็จ", { description: e.message }),
  });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter((p) => {
      if (typeFilter !== "all" && p.type !== typeFilter && p.type !== "both") return false;
      if (!term) return true;
      return [p.name, p.code, p.tax_id, p.email, p.phone].some((v) => v?.toLowerCase().includes(term));
    });
  }, [data, q, typeFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="คู่ค้าและลูกค้า"
        description="ฐานข้อมูลคู่ค้า Supplier และลูกค้าทั้งหมด — ใช้เลือกในหน้าโครงการและใบเสนอราคา"
        actions={
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" /> เพิ่มคู่ค้า / ลูกค้า
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <div className="relative min-w-0 flex-1 sm:min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="ค้นหาชื่อ, รหัส, เลขผู้เสียภาษี, อีเมล" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>

          <SelectContent>
            <SelectItem value="all">ทุกประเภท</SelectItem>
            <SelectItem value="customer">ลูกค้า</SelectItem>
            <SelectItem value="supplier">คู่ค้า / Supplier</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-muted/60" />)}
            </div>
          ) : rows.length > 0 ? (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">รหัส</th>
                  <th className="px-4 py-3">ชื่อ</th>
                  <th className="px-4 py-3">ประเภท</th>
                  <th className="px-4 py-3">เลขผู้เสียภาษี</th>
                  <th className="px-4 py-3">อีเมล</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3 w-[110px]"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
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
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-destructive"
                          onClick={() => { if (confirm(`ลบ ${p.name}?`)) del.mutate(p.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <EmptyState
              icon={Users2}
              title="ยังไม่มีคู่ค้าในระบบ"
              description="เพิ่มข้อมูลคู่ค้าและลูกค้าเพื่อใช้เลือกในโครงการและใบเสนอราคา"
              action={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 h-4 w-4" /> เพิ่มคู่ค้า / ลูกค้า</Button>}
            />
          )}
        </CardContent>
      </Card>

      <PartnerFormDialog open={open} onOpenChange={setOpen} editing={editing} />
    </div>
  );
}
