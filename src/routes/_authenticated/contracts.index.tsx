import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FileSignature, Search, Download, FolderKanban } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { getSupabase } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/format";
import { getProjectFileUrl } from "@/lib/project-files";
import { usePageGuard } from "@/hooks/use-page-access";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/contracts/")({
  head: () => ({
    meta: [
      { title: "สัญญา | Document Hub" },
      { name: "description", content: "รายการสัญญาที่อัปโหลดในโครงการที่คุณมีส่วนร่วม" },
      { property: "og:title", content: "สัญญา | Document Hub" },
      { property: "og:description", content: "รายการสัญญาที่อัปโหลดในโครงการที่คุณมีส่วนร่วม" },
    ],
  }),
  component: ContractsList,
});

type Row = {
  id: string;
  document_name: string;
  file_url: string;
  uploaded_at: string;
  project_id: string;
  projects: { name: string; project_code: string | null } | null;
};

function ContractsList() {
  const guard = usePageGuard("contracts", "สัญญา");
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["contract-docs"],
    enabled: guard.allowed,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("project_documents")
        .select("id, document_name, file_url, uploaded_at, project_id, projects(name, project_code)")
        .eq("document_type", "contract")
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  if (!guard.allowed) return guard.node;

  const rows = (data ?? []).filter((r) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      r.document_name.toLowerCase().includes(s) ||
      (r.projects?.name ?? "").toLowerCase().includes(s) ||
      (r.projects?.project_code ?? "").toLowerCase().includes(s)
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
        title="สัญญา"
        description="แสดงเฉพาะสัญญาที่อัปโหลดไว้ในโครงการที่คุณมีส่วนร่วม — เพิ่มสัญญาใหม่ได้จากหน้าโครงการเท่านั้น"
      />

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="ค้นหาชื่อสัญญา หรือโครงการ..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
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
                    <th className="px-4 py-3">ชื่อไฟล์สัญญา</th>
                    <th className="px-4 py-3">โครงการ</th>
                    <th className="px-4 py-3">อัปโหลดเมื่อ</th>
                    <th className="px-4 py-3 text-right">ไฟล์</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium">{r.document_name}</td>
                      <td className="px-4 py-3">
                        <Link to="/projects/$id" params={{ id: r.project_id }} className="text-primary hover:underline">
                          {r.projects?.project_code ? `${r.projects.project_code} · ` : ""}{r.projects?.name ?? "-"}
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
              icon={FileSignature}
              title="ยังไม่มีสัญญาในโครงการของคุณ"
              description="สัญญาจะแสดงที่นี่เมื่อมีการอัปโหลดในแท็บสัญญาของโครงการที่คุณเป็นสมาชิก"
              action={<Button asChild variant="outline"><Link to="/projects"><FolderKanban className="mr-2 h-4 w-4" />ไปที่โครงการ</Link></Button>}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
