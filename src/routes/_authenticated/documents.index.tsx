import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FileText, Search, Filter, Download, FolderKanban } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabase } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/format";
import { getProjectFileUrl } from "@/lib/project-files";
import { usePageGuard } from "@/hooks/use-page-access";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/documents/")({
  head: () => ({
    meta: [
      { title: "คลังเอกสาร | Document Hub" },
      { name: "description", content: "เอกสารทั้งหมดจากโครงการที่คุณมีส่วนร่วม ค้นหาและเปิดไฟล์ได้จากที่นี่" },
      { property: "og:title", content: "คลังเอกสาร | Document Hub" },
      { property: "og:description", content: "เอกสารทั้งหมดจากโครงการที่คุณมีส่วนร่วม" },
    ],
  }),
  component: DocumentsList,
});

const TYPE_LABEL: Record<string, string> = {
  rfq_spec: "RFQ / Spec",
  tor: "TOR",
  contract: "สัญญา",
  final_quotation: "ใบเสนอราคาฉบับสุดท้าย",
  other: "อื่น ๆ",
};

type Row = {
  id: string;
  document_name: string;
  document_type: string;
  file_url: string;
  uploaded_at: string;
  project_id: string;
  projects: { name: string; code: string | null } | null;
};

function DocumentsList() {
  const guard = usePageGuard("documents", "คลังเอกสาร");
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["project-documents-all"],
    enabled: guard.allowed,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("project_documents")
        .select("id, document_name, document_type, file_url, uploaded_at, project_id, projects(name, code)")
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  if (!guard.allowed) return guard.node;

  const rows = (data ?? []).filter((r) => {
    if (type !== "all" && r.document_type !== type) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      r.document_name.toLowerCase().includes(s) ||
      (r.projects?.name ?? "").toLowerCase().includes(s) ||
      (r.projects?.code ?? "").toLowerCase().includes(s)
    );
  });

  const open = async (path: string) => {
    const url = await getProjectFileUrl(path);
    if (!url) return toast.error("เปิดไฟล์ไม่สำเร็จ");
    window.open(url, "_blank");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="คลังเอกสาร"
        description="แสดงเฉพาะเอกสารจากโครงการที่คุณมีส่วนร่วม — อัปโหลดเอกสารใหม่ได้จากหน้าโครงการเท่านั้น"
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="ค้นหาชื่อเอกสาร หรือโครงการ..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-full sm:w-64"><Filter className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกประเภทเอกสาร</SelectItem>
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-muted/60" />)}</div>
          ) : rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">ชื่อเอกสาร</th>
                    <th className="px-4 py-3">ประเภท</th>
                    <th className="px-4 py-3">โครงการ</th>
                    <th className="px-4 py-3">อัปโหลดเมื่อ</th>
                    <th className="px-4 py-3 text-right">ไฟล์</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium">{r.document_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{TYPE_LABEL[r.document_type] ?? r.document_type}</td>
                      <td className="px-4 py-3">
                        <Link to="/projects/$id" params={{ id: r.project_id }} className="text-primary hover:underline">
                          {r.projects?.code ? `${r.projects.code} · ` : ""}{r.projects?.name ?? "-"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(r.uploaded_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => open(r.file_url)}>
                          <Download className="mr-1.5 h-4 w-4" />เปิด
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={FileText}
              title="ยังไม่มีเอกสารในโครงการของคุณ"
              description="เอกสารจะแสดงที่นี่เมื่อมีการอัปโหลดในโครงการที่คุณเป็นสมาชิก"
              action={<Button asChild variant="outline"><Link to="/projects"><FolderKanban className="mr-2 h-4 w-4" />ไปที่โครงการ</Link></Button>}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
