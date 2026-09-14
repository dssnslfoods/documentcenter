import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FileSpreadsheet, Search, Filter, FileDown, Info } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabase } from "@/lib/supabase";
import { fmtDate, fmtCurrency } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { getProjectFileUrl } from "@/lib/project-files";
import { usePageGuard } from "@/hooks/use-page-access";

export const Route = createFileRoute("/_authenticated/quotations/")({
  head: () => ({
    meta: [
      { title: "ใบเสนอราคา (ฉบับสุดท้าย) | Document Hub" },
      { name: "description", content: "คลังใบเสนอราคาฉบับสุดท้ายจากทุกโครงการ ค้นหาและเปิดไฟล์ได้ทันที" },
      { property: "og:title", content: "ใบเสนอราคา (ฉบับสุดท้าย) | Document Hub" },
      { property: "og:description", content: "คลังใบเสนอราคาฉบับสุดท้ายจากทุกโครงการ ค้นหาและเปิดไฟล์ได้ทันที" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuardedQuotationsList,
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
      // เดิมไม่เช็ก error — ถ้าโหลดไม่สำเร็จจะแสดงเป็น "ไม่มีข้อมูล" แทน
      if (cust.error) throw cust.error;
      if (sup.error) throw sup.error;

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

function GuardedQuotationsList() {
  const guard = usePageGuard("quotations", "ใบเสนอราคา");
  if (!guard.allowed) return guard.node;
  return <QuotationsList />;
}

function QuotationsList() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
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
    <div className="space-y-6">
      <PageHeader
        title="ใบเสนอราคา"
        description="จัดเก็บเฉพาะใบเสนอราคาฉบับสุดท้าย (Final) จากทุกโครงการ — ค้นหาและเปิดไฟล์ได้ทันที"
      />

      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          ใบเสนอราคาที่ยังไม่ใช่ฉบับสุดท้ายจะถูกจัดเก็บอยู่ในโครงการที่เกี่ยวข้อง เมื่อถูกตั้งเป็น Final
          (ใบเสนอลูกค้า) หรือถูกเลือก (ใบเสนอ Supplier) ระบบจะนำมาแสดงในหน้านี้โดยอัตโนมัติ
        </span>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="ค้นหาโครงการ / รหัส / คู่ค้า..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-full sm:w-52"><Filter className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกประเภท</SelectItem>
              <SelectItem value="incoming">ขาเข้า · Supplier</SelectItem>
              <SelectItem value="outgoing">ขาออก · ลูกค้า</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-muted/60" />)}</div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={FileSpreadsheet}
              title="ยังไม่มีใบเสนอราคาฉบับสุดท้าย"
              description="อัปโหลดใบเสนอราคาในโครงการ แล้วตั้งเป็นฉบับสุดท้าย (Final) เพื่อให้แสดงที่นี่"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
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
    </div>
  );
}
