import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, Pencil, GanttChartSquare, CalendarRange, FileSpreadsheet, X, MessagesSquare } from "lucide-react";
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
import { TaskAssignmentDialog } from "@/components/project/task-assignment-dialog";
import { ASSIGNMENT_META, type AssignmentStatus } from "@/lib/task-assignment";

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
  projectName,
  canEdit = true,
}: {
  projectId: string;
  projectName?: string;
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

  // งานใหม่: เริ่มวันถัดจากวันสิ้นสุดของงานล่าสุด (ถ้ายังไม่มีงาน = วันนี้)
  const nextStart = useMemo(() => {
    const list = tasks ?? [];
    if (list.length === 0) return toISO(new Date());
    const lastEnd = list.reduce((max, t) => {
      const d = toDate(t.end_date);
      return d > max ? d : max;
    }, toDate(list[0].end_date));
    return toISO(addDays(lastEnd, 1));
  }, [tasks]);

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (t: Task) => { setEditing(t); setDialogOpen(true); };


  const overall = useMemo(() => {
    const list = tasks ?? [];
    if (!list.length) return 0;
    return Math.round(list.reduce((s, t) => s + (t.progress ?? 0), 0) / list.length);
  }, [tasks]);

  const exportExcel = async () => {
    if (!rows.length || !range) { toast.error("ยังไม่มีงานให้ส่งออก"); return; }
    const ExcelJS = (await import("exceljs")).default;
    const nameOf = (t: Task) =>
      t.assignee_label || members?.find((m) => m.id === t.assignee_id)?.name || "-";
    const msOf = (t: Task) => {
      const m = milestones?.find((x) => x.id === t.milestone_id);
      return m ? `งวด ${m.milestone_number} · ${m.description}` : "-";
    };
    const STATUS_XLS: Record<TaskStatus, string> = {
      not_started: "FFB0B7C3",
      in_progress: "FF2563EB",
      done: "FF16A34A",
      blocked: "FFDC2626",
    };

    // ---- Gantt columns (per day, or per week when the plan is long) ----
    const byWeek = range.days > 90;
    const step = byWeek ? 7 : 1;
    const slots: { start: Date; end: Date; label: string; group: string }[] = [];
    for (let i = 0; i < range.days; i += step) {
      const s = addDays(range.start, i);
      const e = addDays(s, step - 1);
      slots.push({
        start: s,
        end: e,
        label: byWeek ? String(s.getDate()) : String(s.getDate()),
        group: `${TH_MONTH[s.getMonth()]} ${String((s.getFullYear() + 543) % 100).padStart(2, "0")}`,
      });
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("แผนงาน", { views: [{ state: "frozen", xSplit: 7, ySplit: 2 }] });
    ws.properties.defaultRowHeight = 18;

    const headers = ["ลำดับ", "ชื่องาน", "วันเริ่ม", "วันสิ้นสุด", "จำนวนวัน", "สถานะ", "ผู้รับผิดชอบ"];
    const FIXED = headers.length;

    // Row 1: month groups over the gantt area
    const r1 = ws.getRow(1);
    const r2 = ws.getRow(2);
    headers.forEach((h, i) => {
      r2.getCell(i + 1).value = h;
    });
    ws.mergeCells(1, 1, 1, FIXED);
    r1.getCell(1).value = `แผนการดำเนินงาน — ${projectName || "โครงการ"}`;
    slots.forEach((s, i) => {
      r2.getCell(FIXED + 1 + i).value = s.label;
    });
    let gs = 0;
    for (let i = 1; i <= slots.length; i++) {
      if (i === slots.length || slots[i].group !== slots[gs].group) {
        ws.mergeCells(1, FIXED + 1 + gs, 1, FIXED + i);
        r1.getCell(FIXED + 1 + gs).value = slots[gs].group;
        gs = i;
      }
    }
    [r1, r2].forEach((r) => {
      r.font = { name: "Arial", bold: true, size: 10, color: { argb: "FF1F2937" } };
      r.alignment = { horizontal: "center", vertical: "middle" };
      r.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF3F9" } };
        c.border = { top: { style: "thin", color: { argb: "FFD5DCE6" } }, left: { style: "thin", color: { argb: "FFD5DCE6" } }, bottom: { style: "thin", color: { argb: "FFD5DCE6" } }, right: { style: "thin", color: { argb: "FFD5DCE6" } } };
      });
    });
    r1.height = 20;

    const today = new Date(toISO(new Date()) + "T00:00:00");

    rows.forEach(({ task, depth }, i) => {
      const row = ws.getRow(3 + i);
      const s = toDate(task.start_date);
      const e = toDate(task.end_date);
      row.getCell(1).value = i + 1;
      row.getCell(2).value = (depth ? "    ↳ " : "") + task.name;
      row.getCell(3).value = fmtDate(task.start_date);
      row.getCell(4).value = fmtDate(task.end_date);
      row.getCell(5).value = diffDays(e, s) + 1;
      row.getCell(6).value = `${STATUS_META[task.status].label} · ${task.progress ?? 0}%`;
      row.getCell(7).value = nameOf(task);
      row.getCell(2).note = [task.description || "", msOf(task)].filter(Boolean).join("\n");
      row.font = { name: "Arial", size: 10, bold: depth === 0 };

      slots.forEach((sl, k) => {
        const cell = row.getCell(FIXED + 1 + k);
        const overlap = sl.end >= s && sl.start <= e;
        cell.border = { left: { style: "hair", color: { argb: "FFE3E8EF" } }, right: { style: "hair", color: { argb: "FFE3E8EF" } }, bottom: { style: "hair", color: { argb: "FFE3E8EF" } } };
        if (overlap) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_XLS[task.status] } };
        } else if (today >= sl.start && today <= sl.end) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3C4" } };
        }
      });
      row.eachCell({ includeEmpty: false }, (c, n) => {
        if (n <= FIXED) c.border = { bottom: { style: "hair", color: { argb: "FFE3E8EF" } } };
      });
    });

    ws.columns.forEach((c, i) => {
      c.width = i < FIXED ? [6, 40, 13, 13, 10, 22, 20][i] : byWeek ? 3.2 : 3.6;
    });

    // Legend
    const lr = ws.getRow(rows.length + 5);
    lr.getCell(1).value = "คำอธิบายสี:";
    lr.getCell(1).font = { name: "Arial", size: 10, bold: true };
    (Object.keys(STATUS_XLS) as TaskStatus[]).forEach((k, i) => {
      const c = lr.getCell(2 + i);
      c.value = STATUS_META[k].label;
      c.font = { name: "Arial", size: 10, color: { argb: "FFFFFFFF" } };
      c.alignment = { horizontal: "center" };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_XLS[k] } };
    });

    const buf = await wb.xlsx.writeBuffer();
    const safe = (projectName || "project").replace(/[\\/:*?"<>|]/g, "-").slice(0, 60);
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `แผนงาน-${safe}-${toISO(new Date())}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("ส่งออก Excel พร้อม Gantt chart เรียบร้อย");
  };



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
          <Button size="sm" variant="outline" onClick={exportExcel}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />ส่งออก Excel
          </Button>
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
            <div className="w-[132px] shrink-0 border-r sm:w-[260px]">
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
                    <div className="flex shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
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
        key={editing?.id ?? `new-${nextStart}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        task={editing}
        defaultStart={nextStart}
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

// ---- จดจำชื่อผู้รับผิดชอบภายนอกที่ผู้ใช้เคยพิมพ์เอง ----
const ASSIGNEE_LS_KEY = "dh:external-assignees";
const DEFAULT_ASSIGNEES = ["ลูกค้า", "คู่ค้า", "ผู้รับเหมา", "ที่ปรึกษา"];

function loadRememberedAssignees(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ASSIGNEE_LS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function rememberAssignee(label: string): string[] {
  const v = label.trim();
  if (!v || typeof window === "undefined") return loadRememberedAssignees();
  const next = [v, ...loadRememberedAssignees().filter((x) => x !== v)].slice(0, 12);
  try {
    window.localStorage.setItem(ASSIGNEE_LS_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota errors */
  }
  return next;
}

function forgetAssignee(label: string): string[] {
  const next = loadRememberedAssignees().filter((x) => x !== label);
  try {
    window.localStorage.setItem(ASSIGNEE_LS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

function TaskDialog({
  open, onOpenChange, projectId, task, parents, members, milestones, defaultStart,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  task: Task | null;
  parents: Task[];
  members: { id: string; name: string }[];
  milestones: { id: string; milestone_number: number; description: string }[];
  defaultStart: string;
}) {
  const sb = getSupabase();
  const qc = useQueryClient();
  const baseStart = defaultStart || toISO(new Date());
  const baseEnd = toISO(addDays(toDate(baseStart), 1));

  const [name, setName] = useState(task?.name ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [start, setStart] = useState(task?.start_date ?? baseStart);
  const [end, setEnd] = useState(task?.end_date ?? baseEnd);

  const [progress, setProgress] = useState(String(task?.progress ?? 0));
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "not_started");
  const [parentId, setParentId] = useState(task?.parent_id ?? "none");
  const [assignee, setAssignee] = useState(
    task?.assignee_label ? "external" : task?.assignee_id ?? "none",
  );
  const [assigneeLabel, setAssigneeLabel] = useState(task?.assignee_label ?? "");
  const [remembered, setRemembered] = useState<string[]>(() => loadRememberedAssignees());
  useEffect(() => {
    if (open) setRemembered(loadRememberedAssignees());
  }, [open]);
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
      if (error) {
        if (/assignee_label/.test(error.message)) {
          throw new Error("กรุณารัน db/0022_task_assignee_label.sql ใน Supabase ก่อน จึงจะระบุผู้รับผิดชอบภายนอกได้");
        }
        throw error;
      }
    },
    onSuccess: () => {
      if (assignee === "external" && assigneeLabel.trim()) setRemembered(rememberAssignee(assigneeLabel));
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
            <Input
              type="date"
              value={start}
              onChange={(e) => {
                const v = e.target.value;
                setStart(v);
                if (v && (!end || toDate(end) < toDate(v))) setEnd(toISO(addDays(toDate(v), 1)));
              }}
            />
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
                <SelectItem value="external">+ เพิ่มผู้รับผิดชอบภายนอก (ลูกค้า/คู่ค้า)</SelectItem>
              </SelectContent>
            </Select>
            {assignee === "external" && (
              <div className="space-y-1.5 pt-1">
                <Input
                  value={assigneeLabel}
                  onChange={(e) => setAssigneeLabel(e.target.value)}
                  placeholder="เช่น ลูกค้า / คู่ค้า / ผู้รับเหมา"
                />
                <div className="flex flex-wrap gap-1.5">
                  {DEFAULT_ASSIGNEES.map((p) => (
                    <Button
                      key={p}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-full px-3 text-xs"
                      onClick={() => setAssigneeLabel(p)}
                    >
                      {p}
                    </Button>
                  ))}
                </div>
                {remembered.filter((r) => !DEFAULT_ASSIGNEES.includes(r)).length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      เคยใช้ล่าสุด
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {remembered
                        .filter((r) => !DEFAULT_ASSIGNEES.includes(r))
                        .map((r) => (
                          <span
                            key={r}
                            className="inline-flex h-7 items-center gap-1 rounded-full border bg-muted/40 pl-3 pr-1 text-xs"
                          >
                            <button type="button" onClick={() => setAssigneeLabel(r)} className="max-w-[140px] truncate">
                              {r}
                            </button>
                            <button
                              type="button"
                              title="ลบออกจากรายการที่จดจำ"
                              className="rounded-full p-0.5 text-muted-foreground hover:text-destructive"
                              onClick={() => setRemembered(forgetAssignee(r))}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
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
