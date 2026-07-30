import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Calendar, Wallet, User, FileType2, Loader2, Pencil, ArrowRight, Trophy, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getSupabase } from "@/lib/supabase";
import { fmtDate, fmtCurrency } from "@/lib/format";
import { LIFECYCLE_LABEL, nextStatuses, type ProjectLifecycleStatus } from "@/lib/project-lifecycle";
import { EditProjectDialog } from "@/components/project/edit-project-dialog";

type Project = {
  id: string;
  name: string;
  code: string;
  status: ProjectLifecycleStatus;
  progress: number | null;
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  contract_value: number | null;
  description: string | null;
  customer_name: string | null;
  project_type: string | null;
  customer_id?: string | null;
  vat_rate?: number | null;
  is_inhouse?: boolean | null;
  lost_reason: string | null;
  completion_comment: string | null;
  departments?: { name_th?: string } | null;
};

export function OverviewTab({
  project,
  canEdit = true,
  canSeePrice = true,
}: {
  project: Project;
  canEdit?: boolean;
  canSeePrice?: boolean;
}) {
  const sb = getSupabase();
  const qc = useQueryClient();
  const [progressDraft, setProgressDraft] = useState<string>("");
  const [editOpen, setEditOpen] = useState(false);

  const updateStatus = useMutation({
    mutationFn: async ({ status, extra }: { status: ProjectLifecycleStatus; extra?: Record<string, unknown> }) => {
      const patch: Record<string, unknown> = { status, ...extra };
      const { error } = await sb.from("projects").update(patch).eq("id", project.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", project.id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("อัปเดตสถานะสำเร็จ");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateProgress = useMutation({
    mutationFn: async (progress: number) => {
      const { error } = await sb.from("projects").update({ progress }).eq("id", project.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", project.id] });
      toast.success("อัปเดตความคืบหน้าสำเร็จ");
    },
  });

  const progress = project.progress ?? 0;
  const nexts = nextStatuses(project.status);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle>ข้อมูลโครงการ</CardTitle>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />แก้ไข
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoRow icon={Building2} label="แผนก" value={project.departments?.name_th ?? "-"} />
            <InfoRow icon={User} label="ลูกค้า" value={project.customer_name ?? "-"} />
            <InfoRow icon={FileType2} label="ประเภท" value={project.project_type ?? "-"} />
            <InfoRow icon={Wallet} label="งบประมาณ" value={canSeePrice ? fmtCurrency(project.budget, "THB") : "฿ ••••••"} />
            <InfoRow icon={Wallet} label="มูลค่าสัญญา" value={canSeePrice ? fmtCurrency(project.contract_value, "THB") : "฿ ••••••"} />
            <InfoRow icon={Calendar} label="ระยะเวลา" value={`${fmtDate(project.start_date)} → ${fmtDate(project.end_date)}`} />
          </div>
          {project.description && (
            <div className="border-t pt-4">
              <div className="mb-1 text-xs uppercase text-muted-foreground">รายละเอียด</div>
              <p className="whitespace-pre-wrap text-sm">{project.description}</p>
            </div>
          )}
          <EditProjectDialog project={project} open={editOpen} onOpenChange={setEditOpen} />
          {project.status === "lost" && project.lost_reason && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <div className="text-xs font-semibold text-destructive">เหตุผลที่แพ้งาน</div>
              <p className="mt-1 text-sm">{project.lost_reason}</p>
            </div>
          )}
          {project.status === "completed" && project.completion_comment && (
            <div className="rounded-md border border-success/30 bg-success/5 p-3">
              <div className="text-xs font-semibold text-success">สรุปเมื่อปิดโครงการ</div>
              <p className="mt-1 text-sm">{project.completion_comment}</p>
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
            {canEdit && (
              <div className="flex gap-2">
                <Input
                  type="number" min="0" max="100" placeholder="0-100"
                  value={progressDraft}
                  onChange={(e) => setProgressDraft(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={updateProgress.isPending || progressDraft === ""}
                  onClick={() => {
                    const n = Math.max(0, Math.min(100, Number(progressDraft)));
                    updateProgress.mutate(n, { onSuccess: () => setProgressDraft("") });
                  }}
                >อัปเดต</Button>
              </div>
            )}
          </CardContent>
        </Card>

        {canEdit && nexts.length > 0 && (
          <Card>
            <CardHeader><CardTitle>ดำเนินการต่อ</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {nexts.map((s) => (
                <TransitionButton
                  key={s}
                  status={s}
                  projectId={project.id}
                  onCommit={(extra) => updateStatus.mutate({ status: s, extra })}
                  pending={updateStatus.isPending}
                />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function TransitionButton({
  status, onCommit, pending,
}: {
  status: ProjectLifecycleStatus;
  projectId: string;
  onCommit: (extra?: Record<string, unknown>) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const label = LIFECYCLE_LABEL[status];
  const isWon = status === "won";
  const isLost = status === "lost";
  const isCompleted = status === "completed";
  const needsInput = isLost || isCompleted;

  const Icon = isWon ? Trophy : isLost ? XCircle : ArrowRight;
  const tone = isWon
    ? "bg-success text-success-foreground hover:bg-success/90"
    : isLost
      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
      : "";

  if (!needsInput) {
    return (
      <Button className={`w-full justify-between ${tone}`} disabled={pending} onClick={() => onCommit()}>
        <span className="flex items-center gap-2"><Icon className="h-4 w-4" />{label}</span>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={`w-full justify-between ${tone}`}>
          <span className="flex items-center gap-2"><Icon className="h-4 w-4" />{label}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>{isLost ? "เหตุผลที่แพ้งาน" : "สรุปเมื่อปิดโครงการ"}</Label>
          <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
          <Button
            disabled={pending || !reason}
            onClick={() => {
              const extra = isLost ? { lost_reason: reason } : { completion_comment: reason };
              onCommit(extra);
              setOpen(false);
            }}
          >
            ยืนยัน
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
