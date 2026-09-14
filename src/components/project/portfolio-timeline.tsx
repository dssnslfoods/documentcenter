import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Flag,
  Loader2,
  RadioTower,
  Timer,
} from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getSupabase } from "@/lib/supabase";
import { fmtDate, daysUntil } from "@/lib/format";
import { akaBadgeClass } from "@/lib/aka-colors";
import { LIFECYCLE_LABEL, STATUS_TONE, type ProjectLifecycleStatus } from "@/lib/project-lifecycle";
import { ASSIGNMENT_META, splitMissions, type AssignmentStatus } from "@/lib/task-assignment";
import { TaskAssignmentDialog } from "@/components/project/task-assignment-dialog";



type ProjectRow = {
  id: string;
  name: string;
  code: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  health_status: string | null;
  customer_name: string | null;
  customer_aka: string | null;
  customer_aka_color: string | null;
};

type TaskRow = {
  project_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  is_milestone_marker: boolean;
};

type MilestoneRow = {
  project_id: string;
  milestone_number: number;
  description: string;
  due_date: string | null;
  status: string;
};

type AssignRow = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  status: string;
  assignment_status: string;
  assignee_id: string | null;
  assignee_label: string | null;
};

type Delivery = { label: string; date: string; done: boolean; kind: "milestone" | "marker" };

type Assignment = {
  id: string;
  taskId: string;
  label: string;
  assignee: string;
  start: number;
  end: number;
  endDate: string;
  status: AssignmentStatus;
  done: boolean;
};

type Step = {
  key: string;
  label: string;
  start: number;
  end: number;
  endDate: string;
  done: boolean;
  active: boolean;
  row: number;
};

type Lane = {
  project: ProjectRow;
  start: number;
  end: number;
  deliveries: Delivery[];
  steps: Step[];
  assignments: Assignment[];
  finalDue: string | null;
};


const DAY = 86_400_000;
const t = (d: string | null | undefined) => (d ? new Date(`${d}T00:00:00`).getTime() : NaN);
/** ปลายแถบ = สิ้นสุดวันสุดท้าย (รวมวันสิ้นสุด) */
const tEnd = (d: string | null | undefined) => t(d) + DAY;

const HEALTH: Record<string, { label: string; dot: string }> = {
  green: { label: "ปกติ", dot: "bg-success" },
  yellow: { label: "เฝ้าระวัง", dot: "bg-warning" },
  red: { label: "วิกฤต", dot: "bg-destructive" },
  grey: { label: "ยังไม่เริ่ม", dot: "bg-muted-foreground" },
};

const ACTIVE_STATUSES = ["won", "in_progress"];
const HIDDEN_KEY = "portfolio-timeline:hidden-projects";

export function PortfolioTimeline() {
  const sb = getSupabase();
  const [scope, setScope] = useState<"active" | "all">("active");
  const [zoom, setZoom] = useState<"day" | "week" | "month">("month");
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [hidden, setHidden] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(HIDDEN_KEY);
      return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set<string>();
    }
  });
  const [live, setLive] = useState(false);

  const toggleProject = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // Realtime: refresh the timeline whenever projects / plans / assignments change
  useEffect(() => {
    const channel = sb
      .channel("portfolio-timeline-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () =>
        queryClient.invalidateQueries({ queryKey: ["portfolio-timeline"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "project_tasks" }, () =>
        queryClient.invalidateQueries({ queryKey: ["portfolio-timeline"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "project_milestones" }, () =>
        queryClient.invalidateQueries({ queryKey: ["portfolio-timeline"] }),
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      void sb.removeChannel(channel);
    };
  }, [sb, queryClient]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ isDragging: boolean; startX: number; scrollLeft: number }>({
    isDragging: false,
    startX: 0,
    scrollLeft: 0,
  });

  const scrollTimeline = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const step = el.clientWidth * 0.5;
    el.scrollBy({ left: direction === "left" ? -step : step, behavior: "smooth" });
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current = { isDragging: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft };
    el.style.cursor = "grabbing";
    el.style.userSelect = "none";
  };

  const onMouseLeave = () => {
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current.isDragging = false;
    el.style.cursor = "grab";
    el.style.removeProperty("user-select");
  };

  const onMouseUp = () => {
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current.isDragging = false;
    el.style.cursor = "grab";
    el.style.removeProperty("user-select");
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current.isDragging) return;
    const el = scrollRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - dragRef.current.startX) * 1.2;
    el.scrollLeft = dragRef.current.scrollLeft - walk;
  };

  const scrollToMonth = (index: number) => {
    const el = scrollRef.current;
    if (!el || !months.length) return;
    const clamped = Math.max(0, Math.min(index, months.length - 1));
    const target = (months[clamped].left / 100) * el.scrollWidth;
    el.scrollTo({ left: target, behavior: "smooth" });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const el = scrollRef.current;
    if (!el || !months.length) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();

    if (e.key === "Home") return scrollToMonth(0);
    if (e.key === "End") return scrollToMonth(months.length - 1);

    const currentIndex = months.findIndex((m, i) => {
      const leftPx = (m.left / 100) * el.scrollWidth;
      const nextLeftPx = i < months.length - 1 ? (months[i + 1].left / 100) * el.scrollWidth : el.scrollWidth;
      return el.scrollLeft >= leftPx && el.scrollLeft < nextLeftPx;
    });

    const base = currentIndex === -1 ? months.length - 1 : currentIndex;
    scrollToMonth(e.key === "ArrowLeft" ? base - 1 : base + 1);
  };



  const { data, isLoading } = useQuery({
    queryKey: ["portfolio-timeline", "delegated-status-v2"],
    queryFn: async () => {
      const [pr, tk, ms, asg] = await Promise.all([
        sb
          .from("projects")
          .select(
            "id, name, code, status, start_date, end_date, health_status, customer_name, customer_aka, customer_aka_color",
          )
          .order("end_date", { ascending: true, nullsFirst: false }),
        sb
          .from("project_tasks")
          .select("project_id, name, start_date, end_date, status, is_milestone_marker")
          .is("parent_id", null)
          // งานหลักที่ยังไม่มอบหมาย (รวมงานที่ระบุผู้รับผิดชอบแล้วแต่ยังเป็นร่าง) แสดงเป็นขั้นตอน
          .or("assignee_id.is.null,assignment_status.eq.draft"),
        sb.from("project_milestones").select("project_id, milestone_number, description, due_date, status"),
        sb
          .from("project_tasks")
          .select("id, project_id, name, description, start_date, end_date, status, assignment_status, assignee_id, assignee_label")
          .not("assignee_id", "is", null)
          .neq("assignment_status", "draft"),



      ]);
      const assignments = (asg.data ?? []) as unknown as AssignRow[];
      const ids = [...new Set(assignments.map((a) => a.assignee_id).filter(Boolean))] as string[];
      const people = ids.length
        ? ((await sb.from("profiles").select("id, full_name, email").in("id", ids)).data ?? [])
        : [];
      const nameById = new Map<string, string>(
        (people as { id: string; full_name: string | null; email: string | null }[]).map((p) => [
          p.id,
          p.full_name || p.email || "ไม่ระบุชื่อ",
        ]),
      );
      return {
        projects: (pr.data ?? []) as ProjectRow[],
        tasks: (tk.data ?? []) as TaskRow[],
        milestones: (ms.data ?? []) as MilestoneRow[],
        assignments,
        nameById,
      };
    },
  });


  const allLanes: Lane[] = useMemo(() => {
    if (!data) return [];
    const byProjectTasks = new Map<string, TaskRow[]>();
    for (const task of data.tasks) {
      const list = byProjectTasks.get(task.project_id) ?? [];
      list.push(task);
      byProjectTasks.set(task.project_id, list);
    }
    const byProjectMs = new Map<string, MilestoneRow[]>();
    for (const m of data.milestones) {
      const list = byProjectMs.get(m.project_id) ?? [];
      list.push(m);
      byProjectMs.set(m.project_id, list);
    }
    const byProjectAsg = new Map<string, AssignRow[]>();
    for (const a of data.assignments) {
      const list = byProjectAsg.get(a.project_id) ?? [];
      list.push(a);
      byProjectAsg.set(a.project_id, list);
    }



    const rows = data.projects
      .filter((p) => (scope === "all" ? p.status !== "lost" : ACTIVE_STATUSES.includes(p.status)))
      .map<Lane | null>((p) => {
        const tasks = byProjectTasks.get(p.id) ?? [];
        const mss = byProjectMs.get(p.id) ?? [];
        const asgs = byProjectAsg.get(p.id) ?? [];

        const starts = [t(p.start_date), ...tasks.map((x) => t(x.start_date))].filter((n) => !Number.isNaN(n));
        const ends = [
          tEnd(p.end_date),
          ...tasks.map((x) => tEnd(x.end_date)),
          ...mss.map((x) => tEnd(x.due_date)),
        ].filter((n) => !Number.isNaN(n));
        if (!starts.length || !ends.length) return null;

        const deliveries: Delivery[] = [
          ...mss
            .filter((m) => m.due_date)
            .map<Delivery>((m) => ({
              label: `งวด ${m.milestone_number} · ${m.description}`,
              date: m.due_date!,
              done: m.status === "completed" || p.status === "completed",
              kind: "milestone",
            })),
          ...tasks
            .filter((x) => x.is_milestone_marker)
            .map<Delivery>((x) => ({
              label: x.name,
              date: x.end_date,
              done: x.status === "done" || p.status === "completed",
              kind: "marker",
            })),
        ].sort((a, b) => t(a.date) - t(b.date));

        // 1 ภารกิจ = 1 แถบกราฟ (ตรงกับการ์ดในบอร์ดการดำเนินโครงการ)
        const assignments: Assignment[] = asgs
          .filter((a): a is AssignRow & { assignee_id: string } => Boolean(a.assignee_id))
          .flatMap<Assignment>((a) => {
            const missions = splitMissions(a.description).missions;
            const labels = missions.length ? missions : [a.name];
            const base = {
              assignee: data.nameById.get(a.assignee_id) ?? a.assignee_label ?? "ไม่ระบุชื่อ",
              start: t(a.start_date),
              end: tEnd(a.end_date),
              endDate: a.end_date,
              status: (a.assignment_status as AssignmentStatus) ?? "draft",
              done: a.status === "done" || a.assignment_status === "accepted" || p.status === "completed",
            };
            return labels.map((label, idx) => ({
              id: `${a.id}-${idx}`,
              taskId: a.id,
              label,
              ...base,
            }));
          })
          .filter((a) => !Number.isNaN(a.start) && !Number.isNaN(a.end))
          .sort((a, b) => a.end - b.end);


        const steps: Step[] = tasks
          .filter((x) => !x.is_milestone_marker)
          .map<Step>((x) => ({
            key: `${p.id}-${x.name}-${x.start_date}`,
            label: x.name,
            start: t(x.start_date),
            end: Math.max(tEnd(x.end_date), tEnd(x.start_date)),
            endDate: x.end_date,
            done: x.status === "done" || p.status === "completed",
            active: x.status === "in_progress" && p.status !== "completed",
            row: 0,
          }))
          .filter((x) => !Number.isNaN(x.start) && !Number.isNaN(x.end))
          .sort((a, b) => a.start - b.start);

        steps.forEach((st, i) => {
          st.row = i;
        });

        const openDue = deliveries.filter((d) => !d.done).map((d) => d.date);
        return {
          project: p,
          start: Math.min(...starts),
          end: Math.max(...ends),
          deliveries,
          steps,
          assignments,
          finalDue: openDue[0] ?? p.end_date ?? null,
        };

      })
      .filter((x): x is Lane => x !== null);

    return rows.sort((a, b) => (t(a.finalDue) || a.end) - (t(b.finalDue) || b.end));
  }, [data, scope]);

  const lanes = useMemo(() => allLanes.filter((l) => !hidden.has(l.project.id)), [allLanes, hidden]);

  const range = useMemo(() => {
    if (!lanes.length) return null;
    const min = Math.min(...lanes.map((l) => l.start), Date.now());
    const max = Math.max(...lanes.map((l) => l.end), Date.now());
    const pad = Math.max((max - min) * 0.04, 3 * DAY);
    return { min: min - pad, max: max + pad };
  }, [lanes]);

  const months = useMemo(() => {
    if (!range) return [];
    const out: { label: string; sub?: string; left: number; width: number; weekend?: boolean }[] = [];
    const span = range.max - range.min;
    const cursor = new Date(range.min);
    cursor.setHours(0, 0, 0, 0);

    if (zoom === "month") cursor.setDate(1);
    if (zoom === "week") cursor.setDate(cursor.getDate() - cursor.getDay());

    while (cursor.getTime() < range.max) {
      const startMs = Math.max(cursor.getTime(), range.min);
      const nextDate = new Date(cursor);
      if (zoom === "month") nextDate.setMonth(nextDate.getMonth() + 1, 1);
      else if (zoom === "week") nextDate.setDate(nextDate.getDate() + 7);
      else nextDate.setDate(nextDate.getDate() + 1);
      const endMs = Math.min(nextDate.getTime(), range.max);

      const d = new Date(cursor);
      out.push({
        label:
          zoom === "month"
            ? d.toLocaleDateString("th-TH", { month: "short", year: "2-digit" })
            : zoom === "week"
              ? `${d.toLocaleDateString("th-TH", { day: "numeric", month: "short" })}`
              : `${d.getDate()}`,
        sub:
          zoom === "day"
            ? d.toLocaleDateString("th-TH", { weekday: "narrow" })
            : zoom === "week"
              ? `สัปดาห์`
              : undefined,
        weekend: zoom === "day" && (d.getDay() === 0 || d.getDay() === 6),
        left: ((startMs - range.min) / span) * 100,
        width: ((endMs - startMs) / span) * 100,
      });
      cursor.setTime(nextDate.getTime());
    }
    return out;
  }, [range, zoom]);

  const contentMinWidth = useMemo(() => {
    const perTick = zoom === "day" ? 44 : zoom === "week" ? 96 : 90;
    return Math.max(900, 256 + months.length * perTick);
  }, [months.length, zoom]);


  const pct = (ms: number) => (range ? ((ms - range.min) / (range.max - range.min)) * 100 : 0);

  const kpi = useMemo(() => {
    const open = lanes.flatMap((l) => l.deliveries.filter((d) => !d.done));
    const overdue = open.filter((d) => (daysUntil(d.date) ?? 0) < 0).length;
    const soon = open.filter((d) => {
      const n = daysUntil(d.date) ?? 999;
      return n >= 0 && n <= 30;
    }).length;
    const done = lanes.flatMap((l) => l.deliveries.filter((d) => d.done)).length;
    return { projects: lanes.length, overdue, soon, done };
  }, [lanes]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            ภาพรวมกำหนดส่งมอบของทุกโครงการ ก่อนมอบหมายงานให้สมาชิก
          </p>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
              live ? "border-success/40 bg-success/10 text-success" : "border-border text-muted-foreground"
            }`}
          >
            <RadioTower className="h-3 w-3" />
            {live ? "อัปเดตอัตโนมัติ (Realtime)" : "กำลังเชื่อมต่อ Realtime…"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5">
            {(
              [
                { v: "day", label: "รายวัน" },
                { v: "week", label: "รายสัปดาห์" },
                { v: "month", label: "รายเดือน" },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setZoom(o.v)}
                aria-pressed={zoom === o.v}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${
                  zoom === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <Select value={scope} onValueChange={(v) => setScope(v as "active" | "all")}>
            <SelectTrigger className="h-9 w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">เฉพาะโครงการที่ดำเนินการ</SelectItem>
              <SelectItem value="all">ทุกโครงการ (ยกเว้นแพ้งาน)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {allLanes.length > 0 && (
        <div className="tile space-y-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-muted-foreground">
              เลือกโครงการที่จะแสดงในไทม์ไลน์ ({lanes.length}/{allLanes.length})
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => {
                setHidden(new Set());
                try {
                  window.localStorage.setItem(HIDDEN_KEY, "[]");
                } catch {
                  /* ignore */
                }
              }}
            >
              แสดงทั้งหมด
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allLanes.map((l) => {
              const off = hidden.has(l.project.id);
              return (
                <button
                  key={l.project.id}
                  type="button"
                  onClick={() => toggleProject(l.project.id)}
                  aria-pressed={!off}
                  className={`inline-flex max-w-[240px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition ${
                    off
                      ? "border-border bg-muted/40 text-muted-foreground line-through"
                      : "border-primary/40 bg-primary/10 font-medium text-primary"
                  }`}
                >
                  {off ? <EyeOff className="h-3 w-3 shrink-0" /> : <Eye className="h-3 w-3 shrink-0" />}
                  {l.project.customer_aka && (
                    <Badge className={`h-4 px-1 text-[9px] ${akaBadgeClass(l.project.customer_aka_color)}`}>
                      {l.project.customer_aka}
                    </Badge>
                  )}
                  <span className="truncate">{l.project.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}


      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={CalendarClock} tone="text-primary" label="โครงการในไทม์ไลน์" value={kpi.projects} />
        <KpiCard icon={AlertTriangle} tone="text-destructive" label="ส่งมอบเลยกำหนด" value={kpi.overdue} />
        <KpiCard icon={Timer} tone="text-warning" label="ครบกำหนดใน 30 วัน" value={kpi.soon} />
        <KpiCard icon={CheckCircle2} tone="text-success" label="ส่งมอบแล้ว" value={kpi.done} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      ) : !lanes.length || !range ? (
        <EmptyState
          icon={CalendarClock}
          title="ยังไม่มีข้อมูลกำหนดส่งมอบ"
          description="เพิ่มแผนงาน (Timeline) หรืองวดงานในโครงการ เพื่อให้ระบบสร้างไทม์ไลน์ภาพรวมได้"
        />
      ) : (
        <TooltipProvider delayDuration={100}>
          <div className="tile relative overflow-hidden p-0">
            <Button
              variant="secondary"
              size="icon"
              className="absolute left-1 top-1 z-20 h-7 w-7 rounded-full opacity-80 shadow-sm hover:opacity-100"
              onClick={() => scrollTimeline("left")}
              aria-label="เลื่อนไทม์ไลน์ไปซ้าย"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="absolute right-1 top-1 z-20 h-7 w-7 rounded-full opacity-80 shadow-sm hover:opacity-100"
              onClick={() => scrollTimeline("right")}
              aria-label="เลื่อนไทม์ไลน์ไปขวา"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div
              ref={scrollRef}
              tabIndex={0}
              role="region"
              aria-label="ไทม์ไลน์โครงการ"
              className="cursor-grab overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              onMouseDown={onMouseDown}
              onMouseLeave={onMouseLeave}
              onMouseUp={onMouseUp}
              onMouseMove={onMouseMove}
              onKeyDown={onKeyDown}
            >
              <div style={{ minWidth: contentMinWidth }}>
                <div className="flex border-b bg-muted/40">
                  <div className="w-64 shrink-0 border-r px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    โครงการ
                  </div>
                  <div className="relative h-9 flex-1">
                    {months.map((m) => (
                      <div
                        key={m.label + m.left}
                        className={`absolute top-0 h-full overflow-hidden border-l text-[10px] text-muted-foreground ${
                          m.weekend ? "bg-muted/60" : ""
                        }`}
                        style={{ left: `${m.left}%`, width: `${m.width}%` }}
                      >
                        {zoom === "day" ? (
                          <span className="flex h-full flex-col items-center justify-center leading-none">
                            <span className="text-[9px]">{m.sub}</span>
                            <span className="font-medium">{m.label}</span>
                          </span>
                        ) : (
                          <span className="pl-1.5 leading-9">{m.label}</span>
                        )}
                      </div>
                    ))}

                    <div className="absolute top-0 h-full w-px bg-destructive" style={{ left: `${pct(Date.now())}%` }} />
                  </div>
                </div>

                {lanes.map((lane) => {
                  const p = lane.project;
                  const left = pct(lane.start);
                  const width = Math.max(pct(lane.end) - left, 0.6);
                  const stepRows = lane.steps.length ? Math.max(...lane.steps.map((s) => s.row)) + 1 : 0;
                  const asgTop = 38 + stepRows * 22 + 10;

                  const dueIn = p.status === "completed" ? null : daysUntil(lane.finalDue);
                  const health = HEALTH[p.health_status ?? "grey"] ?? HEALTH.grey;
                  return (
                    <div key={p.id} className="flex border-b last:border-b-0 hover:bg-muted/30">
                      <div className="w-64 shrink-0 space-y-1 border-r px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${health.dot}`}
                            title={`สุขภาพโครงการ: ${health.label}`}
                          />
                          <Link
                            to="/projects/$id"
                            params={{ id: p.id }}
                            className="truncate text-xs font-medium hover:text-primary hover:underline"
                          >
                            {p.name}
                          </Link>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          {p.customer_aka && (
                            <Badge className={`h-4 px-1.5 text-[9px] ${akaBadgeClass(p.customer_aka_color)}`}>
                              {p.customer_aka}
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className={`h-4 px-1.5 text-[9px] ${STATUS_TONE[p.status as ProjectLifecycleStatus] ?? ""}`}
                          >
                            {LIFECYCLE_LABEL[p.status as ProjectLifecycleStatus] ?? p.status}
                          </Badge>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {p.status === "completed" ? (
                            <span className="font-medium text-success">ปิดโครงการแล้ว</span>
                          ) : (
                            <>
                              ส่งมอบถัดไป {fmtDate(lane.finalDue)}
                              {dueIn != null && (
                                <span
                                  className={
                                    dueIn < 0 ? "ml-1 font-semibold text-destructive" : "ml-1 font-semibold text-foreground"
                                  }
                                >
                                  {dueIn < 0 ? `เลย ${Math.abs(dueIn)} วัน` : `อีก ${dueIn} วัน`}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        {lane.assignments.length > 0 && (
                          <div className="text-[10px] font-medium text-primary">
                            งานที่มอบหมาย {lane.assignments.length} งาน
                          </div>
                        )}
                      </div>

                      <div
                        className="relative flex-1"
                        style={{ minHeight: Math.max(64, asgTop + lane.assignments.length * 28 + 10) }}
                      >
                        {months.map((m) => (
                          <div
                            key={`g-${p.id}-${m.left}`}
                            className="absolute top-0 h-full border-l border-border/50"
                            style={{ left: `${m.left}%` }}
                          />
                        ))}
                        <div
                          className="absolute top-0 h-full w-px bg-destructive/60"
                          style={{ left: `${pct(Date.now())}%` }}
                        />
                        <div
                          className="absolute h-3 rounded-full bg-primary/25 ring-1 ring-inset ring-primary/40"
                          style={{ top: 16, left: `${left}%`, width: `${width}%` }}
                        />
                        {lane.deliveries.map((d, i) => {
                          const late = !d.done && (daysUntil(d.date) ?? 0) < 0;
                          const color = d.done ? "bg-success" : late ? "bg-destructive" : "bg-primary";
                          return (
                            <Tooltip key={`${p.id}-${i}`}>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className={`absolute flex h-5 w-5 -translate-x-1/2 rotate-45 items-center justify-center rounded-[3px] ring-2 ring-background ${color}`}
                                  style={{ top: 10, left: `${pct(t(d.date))}%` }}
                                  aria-label={d.label}
                                >
                                  <Flag className="h-2.5 w-2.5 -rotate-45 text-background" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <div className="text-xs font-medium">{d.label}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  กำหนดส่งมอบ {fmtDate(d.date)} ·{" "}
                                  {d.done ? "ส่งมอบแล้ว" : late ? "เลยกำหนด" : `อีก ${daysUntil(d.date)} วัน`}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}

                        {lane.steps.map((st) => {
                          const sLeft = pct(st.start);
                          const sWidth = Math.max(pct(st.end) - sLeft, 0.6);
                          const late = !st.done && (daysUntil(st.endDate) ?? 0) < 0;
                          const tone = st.done
                            ? "bg-muted-foreground/25 ring-muted-foreground/30"
                            : late
                              ? "bg-destructive/20 ring-destructive/50"
                              : st.active
                                ? "bg-primary/40 ring-primary/60"
                                : "bg-muted ring-border";
                          return (
                            <Tooltip key={st.key}>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className={`absolute flex h-[18px] items-center overflow-hidden whitespace-nowrap rounded-sm px-1.5 text-left text-[10px] leading-[18px] text-foreground/80 ring-1 ring-inset ${tone}`}
                                  style={{ top: 38 + st.row * 22, left: `${sLeft}%`, width: `${sWidth}%`, minWidth: 10 }}
                                  aria-label={st.label}
                                >
                                  <span className="truncate">{st.label}</span>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <div className="text-xs font-medium">ขั้นตอน: {st.label}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  สิ้นสุด {fmtDate(st.endDate)} ·{" "}
                                  {st.done ? "เสร็จแล้ว" : late ? "เลยกำหนด" : st.active ? "กำลังดำเนินการ" : "ยังไม่เริ่ม"}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}

                        {lane.assignments.map((a, i) => {
                          const aLeft = pct(a.start);
                          const aWidth = Math.max(pct(a.end) - aLeft, 0.5);
                          const late = !a.done && (daysUntil(a.endDate) ?? 0) < 0;
                          const tone = a.done
                            ? "bg-success/70 ring-success"
                            : late
                              ? "bg-destructive/70 ring-destructive"
                              : "bg-sky-400/70 ring-sky-500";
                          return (
                            <Tooltip key={a.id}>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                   className={`absolute flex h-6 cursor-pointer items-center gap-1 overflow-hidden rounded-md px-1.5 text-left shadow-sm ring-1 ring-inset ${tone}`}
                                  style={{ top: asgTop + i * 28, left: `${aLeft}%`, width: `${aWidth}%`, minWidth: 14 }}
                                  aria-label={`${a.assignee} · ${a.label}`}
                                   onDoubleClick={() => setEditTaskId(a.taskId)}
                                >
                                  <span className="truncate rounded bg-background/80 px-1 text-[9px] font-semibold leading-4 text-foreground">
                                    {a.assignee}
                                  </span>
                                  <span className="truncate text-[10px] font-medium leading-4 text-background">
                                    {a.label}
                                  </span>
                                  <span className="pointer-events-none absolute left-full ml-1 whitespace-nowrap text-[9px] leading-4 text-muted-foreground">
                                    {fmtDate(a.endDate)}
                                  </span>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <div className="text-xs font-medium">{a.label}</div>
                                <div className="text-[11px]">ผู้รับผิดชอบ: {a.assignee}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  ส่งมอบ {fmtDate(a.endDate)} · {ASSIGNMENT_META[a.status]?.label ?? a.status}
                                  {late ? " · เลยกำหนด" : ""}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>

                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </TooltipProvider>
      )}

      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rotate-45 rounded-[2px] bg-success" />ส่งมอบแล้ว
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rotate-45 rounded-[2px] bg-primary" />รอส่งมอบ
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rotate-45 rounded-[2px] bg-destructive" />เลยกำหนด
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-5 rounded-sm bg-sky-400/70" />งานที่มอบหมายให้สมาชิก
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-px bg-destructive" />วันนี้
        </span>
      </div>

      <p className="text-[11px] text-muted-foreground">
        คลิกที่ไทม์ไลน์แล้วใช้ปุ่ม <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">←</kbd>{" "}
        <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">→</kbd> เพื่อเลื่อนเป็นเดือน{" "}
        <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">Home</kbd> /{" "}
        <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">End</kbd> เพื่อกระโดดไปต้น/ปลายไทม์ไลน์
      </p>

      <TaskAssignmentDialog
        taskId={editTaskId}
        open={editTaskId !== null}
        onOpenChange={(open) => {
          if (!open) setEditTaskId(null);
        }}
      />
    </div>
  );
}

function KpiCard({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  label: string;
  value: number;
}) {
  return (
    <div className="tile flex items-center gap-3 p-4">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-muted ${tone}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}
