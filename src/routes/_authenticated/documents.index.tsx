import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, FileText, Search, Filter } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { getSupabase } from "@/lib/supabase";
import { fmtDate, fmtCurrency } from "@/lib/format";
import { DocumentStatusBadge, ConfidentialityBadge } from "@/components/status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/documents/")({
  head: () => ({
    meta: [
      { title: "คลังเอกสาร | Document Hub" },
      { name: "description", content: "รายการเอกสารทั้งหมดในระบบ ค้นหา กรอง และจัดการเอกสารได้จากที่นี่" },
    ],
  }),
  component: DocumentsList,
});

function DocumentsList() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["documents", q, status, page],
    queryFn: async () => {
      const sb = getSupabase();
      let query = sb
        .from("documents")
        .select("id, document_no, title, status, confidentiality, end_date, value_amount, currency, category_id, document_categories(name_th), departments(name_th), partners(name)", { count: "exact" })
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);

      if (q.trim()) {
        query = query.or(`title.ilike.%${q}%,document_no.ilike.%${q}%,keywords.ilike.%${q}%`);
      }
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
        title="คลังเอกสาร"
        description="เอกสารทั้งหมดในระบบ — ค้นหาด้วยเลขที่ ชื่อ Tag หรือ Keyword"
        actions={
          <Button asChild>
            <Link to="/documents/new">
              <Plus className="mr-2 h-4 w-4" /> เพิ่มเอกสารใหม่
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="ค้นหา..." value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className="pl-9" />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
            <SelectTrigger className="w-full sm:w-48">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="สถานะทั้งหมด" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">สถานะทั้งหมด</SelectItem>
              <SelectItem value="draft">ร่าง</SelectItem>
              <SelectItem value="under_review">กำลังตรวจสอบ</SelectItem>
              <SelectItem value="active">ใช้งาน</SelectItem>
              <SelectItem value="expired">หมดอายุ</SelectItem>
              <SelectItem value="archived">จัดเก็บ</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-muted/60" />
              ))}
            </div>
          ) : data && data.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">เลขที่</th>
                    <th className="px-4 py-3">ชื่อเอกสาร</th>
                    <th className="px-4 py-3">หมวด</th>
                    <th className="px-4 py-3">แผนก</th>
                    <th className="px-4 py-3">คู่ค้า</th>
                    <th className="px-4 py-3">สถานะ</th>
                    <th className="px-4 py-3">ระดับความลับ</th>
                    <th className="px-4 py-3">สิ้นสุด</th>
                    <th className="px-4 py-3 text-right">มูลค่า</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((d) => (
                    <tr key={d.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link to="/documents/$id" params={{ id: d.id }} className="text-primary hover:underline">
                          {d.document_no}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium">{d.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">{(d.document_categories as { name_th?: string } | null)?.name_th ?? "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{(d.departments as { name_th?: string } | null)?.name_th ?? "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{(d.partners as { name?: string } | null)?.name ?? "-"}</td>
                      <td className="px-4 py-3"><DocumentStatusBadge status={d.status as never} /></td>
                      <td className="px-4 py-3"><ConfidentialityBadge level={d.confidentiality as never} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(d.end_date)}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtCurrency(d.value_amount, d.currency ?? "THB")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={FileText}
              title="ยังไม่มีเอกสารในระบบ"
              description="เริ่มต้นเพิ่มเอกสารแรกของคุณเพื่อจัดเก็บและติดตามอย่างเป็นระบบ"
              action={
                <Button asChild>
                  <Link to="/documents/new">
                    <Plus className="mr-2 h-4 w-4" /> เพิ่มเอกสาร
                  </Link>
                </Button>
              }
            />
          )}

          {data && data.count > pageSize && (
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
              <div className="text-muted-foreground">
                แสดง {page * pageSize + 1}–{Math.min((page + 1) * pageSize, data.count)} จาก {data.count} รายการ
              </div>
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
