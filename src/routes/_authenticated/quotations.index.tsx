import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, FileSpreadsheet, Search, Filter, Star, FileDown } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabase } from "@/lib/supabase";
import { fmtDate, fmtCurrency } from "@/lib/format";
import { QuotationStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { getProjectFileUrl } from "@/lib/project-files";

export const Route = createFileRoute("/_authenticated/quotations/")({
  head: () => ({
    meta: [
      { title: "ใบเสนอราคา | Document Hub" },
      { name: "description", content: "จัดการใบเสนอราคาทั้งขาเข้าและขาออก ติดตามสถานะและมูลค่า" },
    ],
  }),
  component: QuotationsList,
});


type FinalRow = {
  id: string;
  kind: "customer" | "supplier";
  projectId: string;
  projectCode: string | null;
  projectName: string;
  party: string;
  date: string | null;
  amount: number | null;
  amountInclVat: number | null;
  files: string[];
};

/** ใบเสนอราคา final ที่อัปโหลดไว้ในโครงการ (ลูกค้า = ขาออก, supplier = ขาเข้า) */
function useFinalProjectQuotations() {
  return useQuery({
    queryKey: ["final-project-quotations"],
    queryFn: async (): Promise<FinalRow[]> => {
      const sb = getSupabase();
      const [cust, sup] = await Promise.all([
        sb.from("customer_quotations")
          .select("id, project_id, quotation_amount, amount_incl_vat, submitted_date, file_url, projects(id, code, name, customer_name)")
          .eq("is_final", true),
        sb.from("supplier_quotations")
          .select("id, project_id, quotation_amount, amount_incl_vat, received_date, file_urls, supplier_name, partners(name), projects(id, code, name)")
          .eq("is_selected", true),
      ]);

      const pick = <T,>(v: unknown): T | null => (Array.isArray(v) ? (v[0] as T) ?? null : (v as T) ?? null);
      const rows: FinalRow[] = [];

      (cust.data ?? []).forEach((r) => {
        const p = pick<{ id: string; code: string | null; name: string; customer_name: string | null }>(r.projects);
        if (!p) return;
        rows.push({
          id: r.id, kind: "customer", projectId: p.id, projectCode: p.code, projectName: p.name,
          party: p.customer_name ?? "—", date: r.submitted_date ?? null,
          amount: r.quotation_amount ?? null, amountInclVat: r.amount_incl_vat ?? null,
          files: r.file_url ? [r.file_url as string] : [],
        });
      });

      (sup.data ?? []).forEach((r) => {
        const p = pick<{ id: string; code: string | null; name: string }>(r.projects);
        if (!p) return;
        const partner = pick<{ name: string }>(r.partners);
        rows.push({
          id: r.id, kind: "supplier", projectId: p.id, projectCode: p.code, projectName: p.name,
          party: partner?.name ?? (r.supplier_name as string | null) ?? "—", date: r.received_date ?? null,
          amount: r.quotation_amount ?? null, amountInclVat: r.amount_incl_vat ?? null,
          files: Array.isArray(r.file_urls) ? (r.file_urls as string[]) : [],
        });
      });

      return rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    },
  });
}

function FinalProjectQuotations({ q, type }: { q: string; type: string }) {
  const { data, isLoading } = useFinalProjectQuotations();

  const rows = (data ?? []).filter((r) => {
    if (type === "outgoing" && r.kind !== "customer") return false;
    if (type === "incoming" && r.kind !== "supplier") return false;
    const term = q.trim().toLowerCase();
    if (!term) return true;
    return [r.projectName, r.projectCode ?? "", r.party].some((v) => v.toLowerCase().includes(term));
  });

  const openFile = async (path: string) => {
    const url = await getProjectFileUrl(path);
    if (url) window.open(url, "_blank");
  };

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Star className="h-4 w-4 fill-current text-primary" />
          <div>
            <div className="text-sm font-medium">ใบเสนอราคาฉบับสุดท้ายจากโครงการ</div>
            <div className="text-xs text-muted-foreground">ไฟล์ที่อัปโหลดในโครงการและถูกเลือกเป็น Final — ค้นหาได้จากช่องค้นหาด้านบน</div>
          </div>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-muted/60" />)}</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">ยังไม่มีใบเสนอราคาฉบับสุดท้ายจากโครงการ</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">โครงการ</th>
                  <th className="px-4 py-3">ประเภท</th>
                  <th className="px-4 py-3">คู่ค้า / ลูกค้า</th>
                  <th className="px-4 py-3">วันที่</th>
                  <th className="px-4 py-3 text-right">ยอดก่อน VAT</th>
                  <th className="px-4 py-3 text-right">ยอดรวม</th>
                  <th className="px-4 py-3">ไฟล์</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link to="/projects/$id" params={{ id: r.projectId }} className="text-primary hover:underline">
                        <span className="font-mono text-xs">{r.projectCode ?? "-"}</span> <span>{r.projectName}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">{r.kind === "customer" ? "ขาออก · ลูกค้า" : "ขาเข้า · Supplier"}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.party}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.date)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtCurrency(r.amount, "THB")}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtCurrency(r.amountInclVat ?? r.amount, "THB")}</td>
                    <td className="px-4 py-3">
                      {r.files.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : (
                        <div className="flex flex-wrap gap-2">
                          {r.files.map((f, i) => (
                            <Button key={f} size="sm" variant="outline" onClick={() => void openFile(f)}>
                              <FileDown className="mr-1 h-3.5 w-3.5" />ไฟล์{r.files.length > 1 ? ` ${i + 1}` : ""}
                            </Button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuotationsList() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["quotations", q, type, status, page],
    queryFn: async () => {
      const sb = getSupabase();
      let query = sb.from("quotations")
        .select("id, quotation_no, title, type, issue_date, expiry_date, total_amount, currency, status, project_id, partners(name), projects(id, code, name)", { count: "exact" })
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (q.trim()) query = query.or(`title.ilike.%${q}%,quotation_no.ilike.%${q}%`);
      if (type !== "all") query = query.eq("type", type);
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
        title="ใบเสนอราคา"
        description="ใบเสนอราคาขาเข้า (จากผู้ขาย) และขาออก (ถึงลูกค้า) — ติดตามการเจรจาและสถานะ"
        actions={<Button asChild><Link to="/quotations/new"><Plus className="mr-2 h-4 w-4" />เพิ่มใบเสนอราคา</Link></Button>}
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="ค้นหา..." value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className="pl-9" />
          </div>
          <Select value={type} onValueChange={(v) => { setType(v); setPage(0); }}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกประเภท</SelectItem>
              <SelectItem value="incoming">ขาเข้า</SelectItem>
              <SelectItem value="outgoing">ขาออก</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
            <SelectTrigger className="w-full sm:w-52"><Filter className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">สถานะทั้งหมด</SelectItem>
              <SelectItem value="draft">ร่าง</SelectItem>
              <SelectItem value="submitted">ยื่นแล้ว</SelectItem>
              <SelectItem value="under_review">กำลังตรวจ</SelectItem>
              <SelectItem value="negotiation">เจรจา</SelectItem>
              <SelectItem value="approved">อนุมัติ</SelectItem>
              <SelectItem value="won">ชนะงาน</SelectItem>
              <SelectItem value="lost">แพ้งาน</SelectItem>
              <SelectItem value="rejected">ปฏิเสธ</SelectItem>
              <SelectItem value="expired">หมดอายุ</SelectItem>
              <SelectItem value="converted_to_contract">แปลงเป็นสัญญา</SelectItem>
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
                    <th className="px-4 py-3">หัวข้อ</th>
                    <th className="px-4 py-3">โครงการ</th>
                    <th className="px-4 py-3">ประเภท</th>
                    <th className="px-4 py-3">คู่ค้า</th>
                    <th className="px-4 py-3">ออกวันที่</th>
                    <th className="px-4 py-3">หมดอายุ</th>
                    <th className="px-4 py-3">สถานะ</th>
                    <th className="px-4 py-3 text-right">มูลค่ารวม</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((r) => {
                    const projRaw = r.projects as unknown;
                    const proj = (Array.isArray(projRaw) ? projRaw[0] : projRaw) as { id: string; code: string | null; name: string } | null;
                    return (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link to="/quotations/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.quotation_no}</Link>
                      </td>
                      <td className="px-4 py-3 font-medium">{r.title}</td>
                      <td className="px-4 py-3 text-xs">
                        {proj ? (
                          <Link to="/projects/$id" params={{ id: proj.id }} className="text-primary hover:underline">
                            <span className="font-mono">{proj.code ?? "-"}</span> <span className="text-muted-foreground">{proj.name}</span>
                          </Link>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.type === "incoming" ? "ขาเข้า" : "ขาออก"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{(r.partners as { name?: string } | null)?.name ?? "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.issue_date)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.expiry_date)}</td>
                      <td className="px-4 py-3"><QuotationStatusBadge status={r.status} /></td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtCurrency(r.total_amount, r.currency ?? "THB")}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={FileSpreadsheet} title="ยังไม่มีใบเสนอราคา" description="เริ่มสร้างใบเสนอราคาแรก"
              action={<Button asChild><Link to="/quotations/new"><Plus className="mr-2 h-4 w-4" />เพิ่ม</Link></Button>} />
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

      <FinalProjectQuotations q={q} type={type} />
    </div>
  );
}
