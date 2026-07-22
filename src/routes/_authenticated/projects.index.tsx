import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, FolderKanban, Search, Filter } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { getSupabase } from "@/lib/supabase";
import { fmtDate, fmtCurrency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "โครงการ | Document Hub" },
      { name: "description", content: "จัดการโครงการและเอกสารที่เชื่อมโยง" },
    ],
  }),
  component: ProjectsList,
});

const STATUS_LABEL: Record<string, string> = {
  planning: "วางแผน",
  active: "ดำเนินการ",
  on_hold: "พักไว้",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  planning: "outline",
  active: "default",
  on_hold: "secondary",
  completed: "secondary",
  cancelled: "destructive",
};

function ProjectsList() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["projects", q, status, page],
    queryFn: async () => {
      const sb = getSupabase();
      let query = sb
        .from("projects")
        .select("id, code, name, status, progress, start_date, end_date, budget, departments(name_th)", { count: "exact" })
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (q.trim()) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%,description.ilike.%${q}%`);
      if (status !== "all") query = query.eq("status", status);
      const { data, count, error } = await query;
      if (error) throw error;
      return { data: data ?? [], count: count ?? 0 };
    },
  });

  const totalPages = Math.ceil((data?.count ?? 0) / pageSize);

  return (
    <div className="space-y-6">
      <PageHeader
        title="โครงการ"
        description="จัดการโครงการและติดตามความคืบหน้า"
        actions={
          <Button asChild>
            <Link to="/projects/new"><Plus className="mr-2 h-4 w-4" />เพิ่มโครงการใหม่</Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="ค้นหาชื่อ / รหัสโครงการ..." value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className="pl-9" />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
            <SelectTrigger className="w-full sm:w-48">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">สถานะทั้งหมด</SelectItem>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-muted/60" />)}
            </div>
          ) : data && data.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">รหัส</th>
                    <th className="px-4 py-3">ชื่อโครงการ</th>
                    <th className="px-4 py-3">แผนก</th>
                    <th className="px-4 py-3">สถานะ</th>
                    <th className="px-4 py-3 w-40">ความคืบหน้า</th>
                    <th className="px-4 py-3">เริ่ม</th>
                    <th className="px-4 py-3">สิ้นสุด</th>
                    <th className="px-4 py-3 text-right">งบประมาณ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link to="/projects/$id" params={{ id: p.id }} className="text-primary hover:underline">{p.code}</Link>
                      </td>
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{(p.departments as { name_th?: string } | null)?.name_th ?? "-"}</td>
                      <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[p.status ?? "planning"] ?? "outline"}>{STATUS_LABEL[p.status ?? "planning"] ?? p.status}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Progress value={p.progress ?? 0} className="h-2" />
                          <span className="text-xs tabular-nums text-muted-foreground w-10">{p.progress ?? 0}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(p.start_date)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(p.end_date)}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtCurrency(p.budget, "THB")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={FolderKanban}
              title="ยังไม่มีโครงการ"
              description="เริ่มต้นเพิ่มโครงการแรกเพื่อจัดกลุ่มเอกสารและติดตามความคืบหน้า"
              action={<Button asChild><Link to="/projects/new"><Plus className="mr-2 h-4 w-4" />เพิ่มโครงการ</Link></Button>}
            />
          )}
          {data && data.count > pageSize && (
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
              <div className="text-muted-foreground">แสดง {page * pageSize + 1}–{Math.min((page + 1) * pageSize, data.count)} จาก {data.count} รายการ</div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>ก่อนหน้า</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>ถัดไป</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
