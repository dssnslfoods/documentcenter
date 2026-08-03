import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Send, CheckCircle2, Undo2, MessageSquare, ClipboardCheck, UserCheck, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-supabase";
import { fmtDate } from "@/lib/format";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import {
  ASSIGNMENT_META,
  UPDATE_KIND_LABEL,
  type AssignmentStatus,
  type TaskUpdate,
  type TaskUpdateKind,
} from "@/lib/task-assignment";

type TaskRow = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  progress: number;
  status: string;
  assignee_id: string | null;
  assignee_label: string | null;
  assignment_status: AssignmentStatus | null;
};

export function TaskAssignmentDialog({
  taskId,
  open,
  onOpenChange,
  canManage,
}: {
  taskId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** ผู้บริหารโครงการ (มอบหมาย / ตรวจรับงานได้) */
  canManage?: boolean;
}) {
  const sb = getSupabase();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");

  const { data: task } = useQuery({
    queryKey: ["task-assignment", taskId],
    enabled: !!taskId && open,
    queryFn: async () => {
      const { data, error } = await sb.from("project_tasks").select("*").eq("id", taskId!).maybeSingle();
      if (error) throw error;
      return data as unknown as TaskRow | null;
    },
  });

  const projectPermissions = useProjectPermissions(task?.project_id);
  const mayManage = canManage ?? Boolean(projectPermissions.data?.canEditTimeline);

  useEffect(() => {
    if (!task) return;
    setEditName(task.name);
    setEditDescription(task.description ?? "");
    setEditStartDate(task.start_date);
    setEditEndDate(task.end_date);
    setAssignee(task.assignee_id);
  }, [task]);

  const { data: updates, error: updatesError } = useQuery({
    retry: false,
    queryKey: ["task-updates", taskId],
    enabled: !!taskId && open,
    queryFn: async () => {
      const { data, error } = await sb
        .from("project_task_updates")
        .select("*")
        .eq("task_id", taskId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TaskUpdate[];
    },
  });

  const { data: people } = useQuery({
    queryKey: ["task-update-people", taskId, updates?.length],
    enabled: !!updates,
    queryFn: async () => {
      const ids = Array.from(new Set([...(updates ?? []).map((u) => u.author_id), task?.assignee_id].filter(Boolean))) as string[];
      if (!ids.length) return {} as Record<string, string>;
      const { data } = await sb.from("profiles").select("id, full_name, email").in("id", ids);
      return Object.fromEntries(
        (data ?? []).map((p) => [p.id as string, ((p.full_name as string) || (p.email as string)) ?? ""]),
      ) as Record<string, string>;
    },
  });

  const { data: members } = useQuery({
    queryKey: ["task-project-members", task?.project_id],
    enabled: !!task?.project_id && mayManage,
    queryFn: async () => {
      const { data: mem } = await sb.from("project_members").select("user_id").eq("project_id", task!.project_id);
      const ids = (mem ?? []).map((m) => m.user_id).filter(Boolean) as string[];
      if (!ids.length) return [] as { id: string; name: string }[];
      const { data: profs } = await sb.from("profiles").select("id, full_name, email").in("id", ids);
      return (profs ?? []).map((p) => ({
        id: p.id as string,
        name: ((p.full_name as string) || (p.email as string)) ?? "",
      }));
    },
  });

  const saveDetails = useMutation({
    mutationFn: async () => {
      if (!task) return;
      if (!editName.trim()) throw new Error("กรุณาระบุชื่อภารกิจ");
      if (!editStartDate || !editEndDate) throw new Error("กรุณาระบุวันที่เริ่มและวันส่งมอบ");
      if (editEndDate < editStartDate) throw new Error("วันส่งมอบต้องไม่น้อยกว่าวันเริ่มงาน");

      const selected = (members ?? []).find((member) => member.id === assignee);
      const { error } = await sb
        .from("project_tasks")
        .update({
          name: editName.trim(),
          description: editDescription.trim() || null,
          start_date: editStartDate,
          end_date: editEndDate,
          assignee_id: assignee,
          assignee_label: selected?.name ?? task.assignee_label,
        })
        .eq("id", task.id);
      if (error) throw error;

      const changed = [
        task.name !== editName.trim() ? `ชื่อภารกิจ: ${editName.trim()}` : "",
        (task.description ?? "") !== editDescription.trim() ? "แก้ไขรายละเอียดภารกิจ" : "",
        task.start_date !== editStartDate ? `วันเริ่ม: ${fmtDate(editStartDate)}` : "",
        task.end_date !== editEndDate ? `ส่งมอบ: ${fmtDate(editEndDate)}` : "",
        task.assignee_id !== assignee ? `ผู้รับผิดชอบ: ${selected?.name ?? "ยังไม่ระบุ"}` : "",
      ].filter(Boolean);
      if (changed.length && user) {
        await sb.from("project_task_updates").insert({
          task_id: task.id,
          project_id: task.project_id,
          author_id: user.id,
          kind: "feedback",
          message: `แก้ไขงาน · ${changed.join(" · ")}`,
        });
      }
    },
    onSuccess: () => {
      toast.success("บันทึกรายละเอียดงานเรียบร้อย");
      qc.invalidateQueries({ queryKey: ["task-assignment", taskId] });
      qc.invalidateQueries({ queryKey: ["task-updates", taskId] });
      qc.invalidateQueries({ queryKey: ["project-tasks", task?.project_id] });
      qc.invalidateQueries({ queryKey: ["assignment-board-tasks", task?.project_id] });
      qc.invalidateQueries({ queryKey: ["my-assigned-tasks"] });
      qc.invalidateQueries({ queryKey: ["tasks-i-assigned"] });
      qc.invalidateQueries({ queryKey: ["portfolio-timeline"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const missingTable = /project_task_updates/.test(updatesError?.message ?? "");

  const isAssignee = !!task?.assignee_id && task.assignee_id === user?.id;
  const st: AssignmentStatus = (task?.assignment_status ?? "draft") as AssignmentStatus;

  const act = useMutation({
    mutationFn: async ({
      kind,
      patch,
      requireMessage,
    }: {
      kind: TaskUpdateKind;
      patch: Record<string, unknown>;
      requireMessage?: boolean;
    }) => {
      if (!task) return;
      if (requireMessage && !message.trim()) throw new Error("กรุณาระบุรายละเอียด");
      const prog = progress === "" ? null : Math.max(0, Math.min(100, Number(progress) || 0));
      const fullPatch = { ...patch, ...(prog !== null ? { progress: prog } : {}) };
      if (Object.keys(fullPatch).length) {
        const { error } = await sb.from("project_tasks").update(fullPatch).eq("id", task.id);
        if (error) throw error;
      }
      const { error: e2 } = await sb.from("project_task_updates").insert({
        task_id: task.id,
        project_id: task.project_id,
        author_id: user!.id,
        kind,
        message: message.trim() || null,
        progress: prog,
      });
      if (e2) throw e2;
    },
    onSuccess: () => {
      setMessage("");
      setProgress("");
      toast.success("บันทึกเรียบร้อย");
      qc.invalidateQueries({ queryKey: ["task-assignment", taskId] });
      qc.invalidateQueries({ queryKey: ["task-updates", taskId] });
      qc.invalidateQueries({ queryKey: ["project-tasks", task?.project_id] });
      qc.invalidateQueries({ queryKey: ["my-assigned-tasks"] });
      qc.invalidateQueries({ queryKey: ["tasks-i-assigned"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const now = () => new Date().toISOString();
  const busy = act.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 text-base">{task?.name ?? "งาน"}</DialogTitle>
        </DialogHeader>

        {!task ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-5">
            <div className="tile space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={ASSIGNMENT_META[st].badge}>{ASSIGNMENT_META[st].label}</Badge>
                <span className="text-xs text-muted-foreground">
                  {fmtDate(task.start_date)} – {fmtDate(task.end_date)}
                </span>
                <span className="text-xs text-muted-foreground">
                  · ผู้รับผิดชอบ: {task.assignee_label || (task.assignee_id ? people?.[task.assignee_id] : "") || "ยังไม่ระบุ"}
                </span>
              </div>
              {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}
              <div>
                <Progress value={task.progress ?? 0} className="h-2" />
                <div className="mt-1 text-right text-[11px] text-muted-foreground">{task.progress ?? 0}%</div>
              </div>
            </div>

            {mayManage && (
              <div className="space-y-4 rounded-lg border p-4">
                <div className="space-y-2">
                  <Label htmlFor="task-name">ชื่อภารกิจ</Label>
                  <Input id="task-name" value={editName} onChange={(event) => setEditName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="task-description">รายละเอียด</Label>
                  <Textarea
                    id="task-description"
                    rows={3}
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="task-start-date">วันเริ่มงาน</Label>
                    <Input id="task-start-date" type="date" value={editStartDate} onChange={(event) => setEditStartDate(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="task-end-date">กำหนดส่งมอบ</Label>
                    <Input id="task-end-date" type="date" value={editEndDate} onChange={(event) => setEditEndDate(event.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>ผู้รับผิดชอบ</Label>
                <Select
                  value={assignee ?? task.assignee_id ?? ""}
                  onValueChange={(v) => setAssignee(v)}
                  disabled={saveDetails.isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="เลือกสมาชิกโครงการ" />
                  </SelectTrigger>
                  <SelectContent>
                    {(members ?? []).map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                </div>
                <Button size="sm" disabled={saveDetails.isPending} onClick={() => saveDetails.mutate()}>
                  {saveDetails.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  บันทึกรายละเอียดงาน
                </Button>
              </div>
            )}



            {missingTable ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
                <div className="font-semibold text-destructive">ยังไม่ได้ติดตั้งระบบมอบหมายงาน</div>
                <p className="mt-1 text-muted-foreground">
                  กรุณารัน <code className="font-mono">db/0053_task_assignment_workflow.sql</code> ใน Supabase SQL Editor
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>ข้อความ / รายละเอียด</Label>
                  <Textarea
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={isAssignee ? "อัปเดตความคืบหน้า ปัญหาที่พบ หรือรายละเอียดการส่งมอบ" : "ข้อเสนอแนะ / สิ่งที่ต้องแก้ไข"}
                  />
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">ความคืบหน้า (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      className="h-8 w-24"
                      value={progress}
                      onChange={(e) => setProgress(e.target.value)}
                      placeholder={String(task.progress ?? 0)}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {mayManage && task.assignee_id && (st === "draft" || st === "accepted") && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        act.mutate({
                          kind: "assign",
                          patch: { assignment_status: "assigned", assigned_at: now(), assigned_by: user!.id, acknowledged_at: null, submitted_at: null, accepted_at: null },
                        })
                      }
                    >
                      <UserCheck className="mr-2 h-4 w-4" />มอบหมายงานให้สมาชิก
                    </Button>
                  )}

                  {isAssignee && st === "assigned" && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        act.mutate({
                          kind: "acknowledge",
                          patch: { assignment_status: "acknowledged", acknowledged_at: now(), status: "in_progress" },
                        })
                      }
                    >
                      <ClipboardCheck className="mr-2 h-4 w-4" />รับทราบงาน
                    </Button>
                  )}

                  {isAssignee && (st === "acknowledged" || st === "revision" || st === "assigned") && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => act.mutate({ kind: "feedback", patch: {}, requireMessage: true })}
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />ส่ง Feedback / ความคืบหน้า
                    </Button>
                  )}

                  {isAssignee && (st === "acknowledged" || st === "revision") && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        act.mutate({
                          kind: "submit",
                          patch: { assignment_status: "in_review", submitted_at: now() },
                        })
                      }
                    >
                      <Send className="mr-2 h-4 w-4" />ส่งมอบงาน
                    </Button>
                  )}

                  {mayManage && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => act.mutate({ kind: "feedback", patch: {}, requireMessage: true })}
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />ส่งข้อเสนอแนะ
                    </Button>
                  )}

                  {mayManage && st === "in_review" && (
                    <>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          act.mutate({
                            kind: "accept",
                            patch: { assignment_status: "accepted", accepted_at: now(), status: "done", progress: 100 },
                          })
                        }
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />รับมอบงาน
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        disabled={busy}
                        onClick={() =>
                          act.mutate({
                            kind: "revision",
                            patch: { assignment_status: "revision" },
                            requireMessage: true,
                          })
                        }
                      >
                        <Undo2 className="mr-2 h-4 w-4" />ขอให้แก้ไข
                      </Button>
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    ประวัติการติดตามงาน
                  </div>
                  {!updates?.length ? (
                    <p className="text-sm text-muted-foreground">ยังไม่มีการอัปเดต</p>
                  ) : (
                    <ol className="space-y-2">
                      {updates.map((u) => (
                        <li key={u.id} className="rounded-lg border p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{UPDATE_KIND_LABEL[u.kind]}</Badge>
                            <span className="text-xs font-medium">{people?.[u.author_id] ?? "ผู้ใช้"}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {new Date(u.created_at).toLocaleString("th-TH")}
                            </span>
                            {u.progress !== null && (
                              <span className="text-[11px] text-muted-foreground">· {u.progress}%</span>
                            )}
                          </div>
                          {u.message && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{u.message}</p>}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
