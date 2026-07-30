import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, Pencil, GanttChartSquare, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/page-header";
import { getSupabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/format";

type TaskStatus = "not_started" | "in_progress" | "done" | "blocked";

const STATUS_META: Record<TaskStatus, { label: string; bar: string; badge: string }> = {
  not_started: { label: "ยังไม่เริ่ม", bar: "bg-muted-foreground/40", badge: "bg-muted text-foreground" },
  in_progress: { label: "กำลังดำเนินการ", bar: "bg-primary", badge: "bg-primary/10 text-primary" },
  done: { label: "เสร็จสิ้น", bar: "bg-success", badge: "bg-success/15 text-success" },
  blocked: { label: "ติดปัญหา", bar: "bg-destructive", badge: "bg-destructive/10 text-destructive" },
};

type Task = {
  id: string;
  project_id: string;
  parent_id: string | null;
  milestone_id: string | null;
  assignee_id: string | null;
  assignee_label?: string | null;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  progress: number;
  status: TaskStatus;
  sort_order: number;
};

const DAY = 86_400_000;
const toDate = (s: string) => new Date(`${s}T00:00:00`);
const toISO = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const diffDays = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY);
const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

type Zoom = "day" | "week" | "month";
const ZOOM_PX: Record<Zoom, number> = { day: 34, week: 12, month: 4 };

export function TimelineTab({
  projectId,
  canEdit = true,
}: {
  projectId: string;
  canEdit?: boolean;
}) {
  const sb = getSupabase();
  const qc = useQueryClient();
  const [zoom, setZoom] = useState<Zoom>("week");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const { data: tasks, isLoading, error: tasksError } = useQuery({
    retry: false,
    queryKey: ["project-tasks", projectId],
    queryFn: async () => {
      const { data, error } = await sb
        .from("project_tasks")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order")
        .order("start_date");
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  const { data: members } = useQuery({
    queryKey: ["project-task-members", projectId],
    queryFn: async () => {
      const { data: mem } = await sb.from("project_members").select("user_id").eq("project_id", projectId);
      const ids = (mem ?? []).map((m) => m.user_id).filter(Boolean) as string[];
      if (!ids.length) return [] as { id: string; name: string }[];
      const { data: profs } = await sb.from("profiles").select("id, full_name, email").in("id", ids);
      return (profs ?? []).map((p) => ({ id: p.id as string, name: (p.full_name as string) || (p.email as string) }));
    },
  });

  const { data: milestones } = useQuery({
    queryKey: ["project-task-milestones", projectId],
    queryFn: async () => {
      const { data } = await sb
        .from("project_milestones")
        .select("id, milestone_number, description")
        .eq("project_id", projectId)
        .order("milestone_number");
      return (data ?? []) as { id: string; milestone_number: number; description: string }[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("project_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ลบงานเรียบร้อย");
      qc.invalidateQueries({ queryKey: ["project-tasks", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const missingTable = /project_tasks/.test(tasksError?.message ?? "");

  // ---- Ordered rows: parents then their children ----
  const rows = useMemo(() => {
    const list = tasks ?? [];
    const roots = list.filter((t) => !t.parent_id);
    const out: { task: Task; depth: number }[] = [];
    for (const r of roots) {
      out.push({ task: r, depth: 0 });
      list.filter((c) => c.parent_id === r.id).forEach((c) => out.push({ task: c, depth: 1 }));
    }
    // orphans (parent deleted/filtered)
    list
      .filter((t) => t.parent_id && !roots.some((r) => r.id === t.parent_id))
      .forEach((t) => out.push({ task: t, depth: 0 }));
    return out;
  }, [tasks]);

  const range = useMemo(() => {
    const list = tasks ?? [];
    if (!list.length) return null;
    let min = toDate(list[0].start_date);
    let max = toDate(list[0].end_date);
    for (const t of list) {
      const s = toDate(t.start_date);
      const e = toDate(t.end_date);
      if (s < min) min = s;
      if (e > max) max = e;
    }
    const start = addDays(min, -3);
    const end = addDays(max, 3);
    return { start, end, days: diffDays(end, start) + 1 };
  }, [tasks]);

  const px = ZOOM_PX[zoom];

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (t: Task) => { setEditing(t); setDialogOpen(true); };

  const overall = useMemo(() => {
    const list = tasks ?? [];
    if (!list.length) return 0;
    return Math.round(list.reduce((s, t) => s + (t.progress ?? 0), 0) / list.length);
  }, [tasks]);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="tile flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          <GanttChartSquare className="h-5 w-5 text-primary" />
          <div>
            <div className="text-sm font-semibold">แผนการดำเนินงาน (Project Timeline)</div>
            <div className="text-xs text-muted-foreground">
              {rows.length} งาน · ความคืบหน้าเฉลี่ย {overall}%
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-muted p-1 text-xs">
            {(["day", "week", "month"] as Zoom[]).map((z) => (
              <button
                key={z}
                onClick={() => setZoom(z)}
                className={`rounded-full px-3 py-1 transition-colors ${zoom === z ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
              >
                {z === "day" ? "วัน" : z === "week" ? "สัปดาห์" : "เดือน"}
              </button>
            ))}
          </div>
          {canEdit && (
            <Button size="sm" onClick={openNew}><Plus className="mr-2 h-4 w-4" />เพิ่มงาน</Button>
          )}
        </div>
      </div>

      {missingTable ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm">
          <div className="font-semibold text-destructive">ยังไม่ได้สร้างตารางแผนงานในฐานข้อมูล</div>
          <p className="mt-1 text-muted-foreground">
            กรุณารันสคริปต์ <code className="font-mono">db/0021_project_tasks.sql</code> ใน Supabase SQL Editor
            แล้วรีเฟรชหน้านี้อีกครั้ง (ระบบจึงจะบันทึกงานในแผนได้)
          </p>
        </div>
      ) : !rows.length ? (
        <EmptyState
          icon={CalendarRange}
          title="ยังไม่มีแผนงาน"
          description="เพิ่มงานเพื่อสร้าง Gantt chart ของโครงการ กำหนดวันเริ่ม-สิ้นสุด ผู้รับผิดชอบ และความคืบหน้า"
        />
      ) : (
        <div className="tile overflow-hidden">
          <div className="flex">
            {/* Left: task list */}
            <div className="w-[260px] shrink-0 border-r">
              <div className="flex h-12 items-center border-b bg-muted/40 px-3 text-xs font-semibold text-muted-foreground">
                รายการงาน
              </div>
              {rows.map(({ task, depth }) => (
                <div key={task.id} className="group flex h-12 items-center gap-2 border-b px-3 last:border-b-0">
                  <div className="min-w-0 flex-1" style={{ paddingLeft: depth * 12 }}>
                    <div className="truncate text-xs font-medium">{task.name}</div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {task.assignee_label || members?.find((m) => m.id === task.assignee_id)?.name || "ไม่ระบุผู้รับผิดชอบ"}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(task)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove.mutate(task.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Right: gantt */}
            <div className="min-w-0 flex-1 overflow-x-auto">
              <div style={{ width: (range?.days ?? 0) * px }}>
                <GanttHeader range={range!} px={px} zoom={zoom} />
                {rows.map(({ task }) => (
                  <GanttRow key={task.id} task={task} range={range!} px={px} onClick={() => canEdit && openEdit(task)} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <TaskDialog
        key={editing?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        task={editing}
        parents={(tasks ?? []).filter((t) => !t.parent_id && t.id !== editing?.id)}
        members={members ?? []}
        milestones={milestones ?? []}
      />
    </div>
  );
}

function GanttHeader({ range, px, zoom }: { range: { start: Date; days: number }; px: number; zoom: Zoom }) {
  const cells: { label: string; span: number; sub?: string }[] = [];
  if (zoom === "day") {
    for (let i = 0; i < range.days; i++) {
      const d = addDays(range.start, i);
      cells.push({ label: String(d.getDate()), span: 1, sub: TH_MONTH[d.getMonth()] });
    }
  } else {
    // group by month
    let i = 0;
    while (i < range.days) {
      const d = addDays(range.start, i);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const span = Math.min(diffDays(monthEnd, d) + 1, range.days - i);
      cells.push({ label: `${TH_MONTH[d.getMonth()]} ${String((d.getFullYear() + 543) % 100).padStart(2, "0")}`, span });
      i += span;
    }
  }
  return (
    <div className="flex h-12 items-stretch border-b bg-muted/40">
      {cells.map((c, i) => (
        <div
          key={i}
          className="flex flex-col items-center justify-center border-r text-[10px] text-muted-foreground last:border-r-0"
          style={{ width: c.span * px }}
        >
          <span className="font-semibold text-foreground/80">{c.label}</span>
          {c.sub && <span>{c.sub}</span>}
        </div>
      ))}
    </div>
  );
}

function GanttRow({
  task, range, px, onClick,
}: {
  task: Task;
  range: { start: Date; days: number };
  px: number;
  onClick: () => void;
}) {
  const s = toDate(task.start_date);
  const e = toDate(task.end_date);
  const offset = Math.max(0, diffDays(s, range.start));
  const span = Math.max(1, diffDays(e, s) + 1);
  const todayOffset = diffDays(new Date(new Date().toDateString()), range.start);
  const meta = STATUS_META[task.status];

  return (
    <div className="relative flex h-12 items-center border-b last:border-b-0">
      {todayOffset >= 0 && todayOffset <= range.days && (
        <div className="pointer-events-none absolute inset-y-0 w-px bg-destructive/50" style={{ left: todayOffset * px }} />
      )}
      <button
        onClick={onClick}
        title={`${task.name} · ${fmtDate(task.start_date)} → ${fmtDate(task.end_date)} · ${task.progress}%`}
        className="absolute h-6 overflow-hidden rounded-md border border-border/50 bg-muted text-left shadow-sm transition-transform hover:scale-[1.01]"
        style={{ left: offset * px + 2, width: Math.max(span * px - 4, 8) }}
      >
        <span className={`absolute inset-y-0 left-0 ${meta.bar}`} style={{ width: `${task.progress}%` }} />
        <span className="relative z-10 block truncate px-2 text-[10px] font-medium leading-6">
          {span * px > 60 ? `${task.name} · ${task.progress}%` : ""}
        </span>
      </button>
    </div>
  );
}

function TaskDialog({
  open, onOpenChange, projectId, task, parents, members, milestones,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  task: Task | null;
  parents: Task[];
  members: { id: string; name: string }[];
  milestones: { id: string; milestone_number: number; description: string }[];
}) {
  const sb = getSupabase();
  const qc = useQueryClient();
  const today = toISO(new Date());

  const [name, setName] = useState(task?.name ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [start, setStart] = useState(task?.start_date ?? today);
  const [end, setEnd] = useState(task?.end_date ?? today);
  const [progress, setProgress] = useState(String(task?.progress ?? 0));
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "not_started");
  const [parentId, setParentId] = useState(task?.parent_id ?? "none");
  const [assignee, setAssignee] = useState(
    task?.assignee_label ? "external" : task?.assignee_id ?? "none",
  );
  const [assigneeLabel, setAssigneeLabel] = useState(task?.assignee_label ?? "");
  const [milestoneId, setMilestoneId] = useState(task?.milestone_id ?? "none");
  const [sortOrder, setSortOrder] = useState(String(task?.sort_order ?? 0));

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("กรุณาระบุชื่องาน");
      if (toDate(end) < toDate(start)) throw new Error("วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");
      const payload = {
        project_id: projectId,
        name: name.trim(),
        description: description || null,
        start_date: start,
        end_date: end,
        progress: Math.max(0, Math.min(100, Number(progress) || 0)),
        status,
        parent_id: parentId === "none" ? null : parentId,
        assignee_id: assignee === "none" || assignee === "external" ? null : assignee,
        assignee_label: assignee === "external" ? assigneeLabel.trim() || null : null,
        milestone_id: milestoneId === "none" ? null : milestoneId,
        sort_order: Number(sortOrder) || 0,
      };
      const { error } = task
        ? await sb.from("project_tasks").update(payload).eq("id", task.id)
        : await sb.from("project_tasks").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(task ? "บันทึกการแก้ไขแล้ว" : "เพิ่มงานเรียบร้อย");
      qc.invalidateQueries({ queryKey: ["project-tasks", projectId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{task ? "แก้ไขงาน" : "เพิ่มงานในแผน"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>ชื่องาน</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ออกแบบระบบ / ติดตั้งหน้างาน" />
          </div>
          <div className="space-y-1.5">
            <Label>วันเริ่ม</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>วันสิ้นสุด</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>สถานะ</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_META) as TaskStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>ความคืบหน้า (%)</Label>
            <Input type="number" min="0" max="100" value={progress} onChange={(e) => setProgress(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>อยู่ภายใต้งานหลัก</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger><SelectValue placeholder="ไม่มี" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— ไม่มี (งานหลัก) —</SelectItem>
                {parents.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>ผู้รับผิดชอบ</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger><SelectValue placeholder="ไม่ระบุ" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>ผูกกับงวดงาน</Label>
            <Select value={milestoneId} onValueChange={setMilestoneId}>
              <SelectTrigger><SelectValue placeholder="ไม่ผูก" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— ไม่ผูก —</SelectItem>
                {milestones.map((m) => (
                  <SelectItem key={m.id} value={m.id}>งวด {m.milestone_number} · {m.description}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>ลำดับการแสดง</Label>
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>รายละเอียด</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Badge variant="outline" className={STATUS_META[status].badge}>{STATUS_META[status].label}</Badge>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
