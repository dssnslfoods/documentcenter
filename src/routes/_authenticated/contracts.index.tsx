import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, FileSignature, Search, Filter } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabase } from "@/lib/supabase";
import { fmtDate, fmtCurrency } from "@/lib/format";
import { ContractStatusBadge } from "@/components/status-badge";

export const Route = createFileRoute("/_authenticated/contracts/")({
  head: () => ({
    meta: [
      { title: "สัญญา | Document Hub" },
      { name: "description", content: "จัดการสัญญาทั้งหมดขององค์กร ติดตามสถานะและวันหมดอายุ" },
    ],
  }),
  component: ContractsList,
});

function ContractsList() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["contracts", q, status, page],
    queryFn: async () => {
      const sb = getSupabase();
      let query = sb
        .from("contracts")
        .select("id, contract_no, title, contract_type, start_date, end_date, value_amount, currency, status, partners(name), departments(name_th)", { count: "exact" })
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (q.trim()) query = query.or(`title.ilike.%${q}%,contract_no.ilike.%${q}%`);
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
        title="สัญญา"
        description="รายการสัญญาทั้งหมด — ติดตามสถานะ วันมีผล และวันหมดอายุ"
        actions={
          <Button asChild>
            <Link to="/contracts/new"><Plus className="mr-2 h-4 w-4" />เพิ่มสัญญาใหม่</Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="ค้นหาเลขที่หรือชื่อสัญญา..." value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className="pl-9" />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
            <SelectTrigger className="w-full sm:w-56"><Filter className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">สถานะทั้งหมด</SelectItem>
              <SelectItem value="draft">ร่าง</SelectItem>
              <SelectItem value="under_review">กำลังตรวจ</SelectItem>
              <SelectItem value="pending_approval">รออนุมัติ</SelectItem>
              <SelectItem value="pending_signature">รอลงนาม</SelectItem>
              <SelectItem value="active">มีผลบังคับใช้</SelectItem>
              <SelectItem value="near_expiry">ใกล้หมดอายุ</SelectItem>
              <SelectItem value="expired">หมดอายุ</SelectItem>
              <SelectItem value="terminated">ยกเลิก</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-muted/60" />)}</div>
          ) : data && data.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">เลขที่</th>
                    <th className="px-4 py-3">ชื่อสัญญา</th>
                    <th className="px-4 py-3">คู่สัญญา</th>
                    <th className="px-4 py-3">แผนก</th>
                    <th className="px-4 py-3">เริ่ม</th>
                    <th className="px-4 py-3">สิ้นสุด</th>
                    <th className="px-4 py-3">สถานะ</th>
                    <th className="px-4 py-3 text-right">มูลค่า</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link to="/contracts/$id" params={{ id: c.id }} className="text-primary hover:underline">{c.contract_no}</Link>
                      </td>
                      <td className="px-4 py-3 font-medium">{c.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">{(c.partners as { name?: string } | null)?.name ?? "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{(c.departments as { name_th?: string } | null)?.name_th ?? "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(c.start_date)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(c.end_date)}</td>
                      <td className="px-4 py-3"><ContractStatusBadge status={c.status as never} /></td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtCurrency(c.value_amount, c.currency ?? "THB")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={FileSignature} title="ยังไม่มีสัญญาในระบบ" description="เริ่มต้นสร้างสัญญาแรกเพื่อติดตามและบริหารสัญญาอย่างเป็นระบบ"
              action={<Button asChild><Link to="/contracts/new"><Plus className="mr-2 h-4 w-4" />เพิ่มสัญญา</Link></Button>} />
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
