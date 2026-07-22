import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { ArrowLeft, Calendar, Building2, Wallet, FileText, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { getSupabase } from "@/lib/supabase";
import { fmtDate, fmtCurrency } from "@/lib/format";

type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "วางแผน", active: "ดำเนินการ", on_hold: "พักไว้", completed: "เสร็จสิ้น", cancelled: "ยกเลิก",
};
const STATUS_VARIANT: Record<ProjectStatus, "default" | "secondary" | "destructive" | "outline"> = {
  planning: "outline", active: "default", on_hold: "secondary", completed: "secondary", cancelled: "destructive",
};

export const Route = createFileRoute("/_authenticated/projects/$id")({
  head: () => ({ meta: [{ title: "รายละเอียดโครงการ | Document Hub" }] }),
  component: ProjectDetail,
});

function ProjectDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [progressDraft, setProgressDraft] = useState<string>("");

  const { data: p, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("projects")
        .select("*, departments(name_th)")
        .eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: docs } = useQuery({
    queryKey: ["project-documents", id],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("documents")
        .select("id, document_no, title, status, end_date")
        .eq("project_id", id)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (status: ProjectStatus) => {
      const { error } = await getSupabase().from("projects").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("อัปเดตสถานะสำเร็จ");
    },
    onError: (e: Error) => toast.error("อัปเดตไม่สำเร็จ", { description: e.message }),
  });

  const updateProgress = useMutation({
    mutationFn: async (progress: number) => {
      const { error } = await getSupabase().from("projects").update({ progress }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", id] });
      toast.success("อัปเดตความคืบหน้าสำเร็จ");
    },
    onError: (e: Error) => toast.error("อัปเดตไม่สำเร็จ", { description: e.message }),
  });

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }
  if (!p) return <div className="py-16 text-center text-muted-foreground">ไม่พบโครงการ</div>;

  const status = (p.status ?? "planning") as ProjectStatus;
  const progress = p.progress ?? 0;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/projects" })}>
        <ArrowLeft className="mr-2 h-4 w-4" />กลับรายการโครงการ
      </Button>

      <PageHeader
        title={p.name}
        description={<span className="font-mono text-xs">{p.code}</span>}
        actions={<Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>ข้อมูลโครงการ</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow icon={Building2} label="แผนก" value={(p.departments as { name_th?: string } | null)?.name_th ?? "-"} />
              <InfoRow icon={Wallet} label="งบประมาณ" value={fmtCurrency(p.budget, "THB")} />
              <InfoRow icon={Calendar} label="เริ่ม" value={fmtDate(p.start_date)} />
              <InfoRow icon={Calendar} label="สิ้นสุด" value={fmtDate(p.end_date)} />
            </div>
            {p.description && (
              <div className="border-t pt-4">
                <div className="mb-1 text-xs uppercase text-muted-foreground">รายละเอียด</div>
                <p className="whitespace-pre-wrap text-sm">{p.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>ความคืบหน้า</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Progress value={progress} className="h-3" />
                <span className="text-lg font-semibold tabular-nums">{progress}%</span>
              </div>
              <div className="flex gap-2">
                <Input type="number" min="0" max="100" placeholder="0-100" value={progressDraft} onChange={(e) => setProgressDraft(e.target.value)} />
                <Button
                  size="sm"
                  disabled={updateProgress.isPending || progressDraft === ""}
                  onClick={() => {
                    const n = Math.max(0, Math.min(100, Number(progressDraft)));
                    updateProgress.mutate(n, { onSuccess: () => setProgressDraft("") });
                  }}
                >อัปเดต</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>เปลี่ยนสถานะ</CardTitle></CardHeader>
            <CardContent>
              <Select value={status} onValueChange={(v) => updateStatus.mutate(v as ProjectStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" />เอกสารในโครงการ ({docs?.length ?? 0})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {docs && docs.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="border-y bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">เลขที่</th>
                  <th className="px-4 py-2">ชื่อ</th>
                  <th className="px-4 py-2">สถานะ</th>
                  <th className="px-4 py-2">สิ้นสุด</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2 font-mono text-xs">
                      <Link to="/documents/$id" params={{ id: d.id }} className="text-primary hover:underline">{d.document_no}</Link>
                    </td>
                    <td className="px-4 py-2">{d.title}</td>
                    <td className="px-4 py-2 text-muted-foreground">{d.status}</td>
                    <td className="px-4 py-2 text-muted-foreground">{fmtDate(d.end_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-8 text-center text-sm text-muted-foreground">ยังไม่มีเอกสารในโครงการนี้ — เลือกโครงการนี้เมื่อสร้างเอกสารใหม่</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div>
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}
