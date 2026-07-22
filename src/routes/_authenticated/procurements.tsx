import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, ShoppingCart, Search, Filter } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabase } from "@/lib/supabase";
import { fmtDate, fmtCurrency } from "@/lib/format";
import { ProcurementStatusBadge } from "@/components/status-badge";

export const Route = createFileRoute("/_authenticated/procurements")({
  head: () => ({
    meta: [
      { title: "จัดซื้อและจัดจ้าง | Document Hub" },
      { name: "description", content: "จัดการคำขอจัดซื้อจัดจ้าง ติดตามการอนุมัติและส่งมอบ" },
    ],
  }),
  component: ProcurementsList,
});

function ProcurementsList() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["procurements", q, status, page],
    queryFn: async () => {
      const sb = getSupabase();
      let query = sb.from("procurements")
        .select("id, procurement_no, title, procurement_type, estimated_value, approved_value, request_date, need_date, status, departments(name_th), partners:supplier_id(name)", { count: "exact" })
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (q.trim()) query = query.or(`title.ilike.%${q}%,procurement_no.ilike.%${q}%`);
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
        title="จัดซื้อและจัดจ้าง"
        description="คำขอจัดซื้อจัดจ้าง — ติดตามตั้งแต่ยื่นคำขอถึงส่งมอบและตรวจรับ"
        actions={<Button asChild><Link to="/procurements/new"><Plus className="mr-2 h-4 w-4" />เพิ่มคำขอ</Link></Button>}
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="ค้นหา..." value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className="pl-9" />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
            <SelectTrigger className="w-full sm:w-56"><Filter className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">สถานะทั้งหมด</SelectItem>
              <SelectItem value="draft">ร่าง</SelectItem>
              <SelectItem value="request_submitted">ยื่นคำขอ</SelectItem>
              <SelectItem value="under_review">กำลังตรวจ</SelectItem>
              <SelectItem value="rfq">RFQ</SelectItem>
              <SelectItem value="vendor_comparison">เปรียบเทียบผู้ขาย</SelectItem>
              <SelectItem value="pending_approval">รออนุมัติ</SelectItem>
              <SelectItem value="approved">อนุมัติแล้ว</SelectItem>
              <SelectItem value="in_progress">กำลังดำเนินการ</SelectItem>
              <SelectItem value="delivered">ส่งมอบแล้ว</SelectItem>
              <SelectItem value="inspection_pending">รอตรวจรับ</SelectItem>
              <SelectItem value="completed">เสร็จสิ้น</SelectItem>
              <SelectItem value="cancelled">ยกเลิก</SelectItem>
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
                    <th className="px-4 py-3">ชื่อรายการ</th>
                    <th className="px-4 py-3">แผนก</th>
                    <th className="px-4 py-3">ผู้ขาย</th>
                    <th className="px-4 py-3">ยื่นวันที่</th>
                    <th className="px-4 py-3">ต้องการ</th>
                    <th className="px-4 py-3">สถานะ</th>
                    <th className="px-4 py-3 text-right">มูลค่าประเมิน</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link to="/procurements/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.procurement_no}</Link>
                      </td>
                      <td className="px-4 py-3 font-medium">{r.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">{(r.departments as { name_th?: string } | null)?.name_th ?? "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{(r.partners as { name?: string } | null)?.name ?? "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.request_date)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.need_date)}</td>
                      <td className="px-4 py-3"><ProcurementStatusBadge status={r.status} /></td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtCurrency(r.approved_value ?? r.estimated_value, "THB")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={ShoppingCart} title="ยังไม่มีคำขอจัดซื้อ" description="เริ่มยื่นคำขอจัดซื้อจัดจ้างแรก"
              action={<Button asChild><Link to="/procurements/new"><Plus className="mr-2 h-4 w-4" />เพิ่ม</Link></Button>} />
          )}

          {data && data.count > pageSize && (
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
              <div className="text-muted-foreground">แสดง {page * pageSize + 1}–{Math.min((page + 1) * pageSize, data.count)} จาก {data.count}</div>
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
