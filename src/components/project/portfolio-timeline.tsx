import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, Flag, Loader2, Timer } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
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
};

type Delivery = { label: string; date: string; done: boolean; kind: "milestone" | "marker" };

type Assignment = {
  id: string;
  label: string;
  assignee: string;
  start: number;
  end: number;
  endDate: string;
  status: AssignmentStatus;
  done: boolean;
};

type Lane = {
  project: ProjectRow;
  start: number;
  end: number;
  deliveries: Delivery[];
  assignments: Assignment[];
  finalDue: string | null;
};


const DAY = 86_400_000;
const t = (d: string | null | undefined) => (d ? new Date(`${d}T00:00:00`).getTime() : NaN);

const HEALTH: Record<string, { label: string; dot: string }> = {
  green: { label: "ปกติ", dot: "bg-success" },
  yellow: { label: "เฝ้าระวัง", dot: "bg-warning" },
  red: { label: "วิกฤต", dot: "bg-destructive" },
  grey: { label: "ยังไม่เริ่ม", dot: "bg-muted-foreground" },
};

const ACTIVE_STATUSES = ["won", "in_progress"];

export function PortfolioTimeline() {
  const sb = getSupabase();
  const [scope, setScope] = useState<"active" | "all">("active");

  const { data, isLoading } = useQuery({
    queryKey: ["portfolio-timeline"],
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
          .is("parent_id", null),
        sb.from("project_milestones").select("project_id, milestone_number, description, due_date, status"),
        sb
          .from("project_tasks")
          .select("id, project_id, name, description, start_date, end_date, status, assignment_status, assignee_id")
          .not("parent_id", "is", null)
          .not("assignee_id", "is", null),
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


  const lanes: Lane[] = useMemo(() => {
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

    const rows = data.projects
      .filter((p) => (scope === "all" ? p.status !== "lost" : ACTIVE_STATUSES.includes(p.status)))
      .map<Lane | null>((p) => {
        const tasks = byProjectTasks.get(p.id) ?? [];
        const mss = byProjectMs.get(p.id) ?? [];

        const starts = [t(p.start_date), ...tasks.map((x) => t(x.start_date))].filter((n) => !Number.isNaN(n));
        const ends = [
          t(p.end_date),
          ...tasks.map((x) => t(x.end_date)),
          ...mss.map((x) => t(x.due_date)),
        ].filter((n) => !Number.isNaN(n));
        if (!starts.length || !ends.length) return null;

        const deliveries: Delivery[] = [
          ...mss
            .filter((m) => m.due_date)
            .map<Delivery>((m) => ({
              label: `งวด ${m.milestone_number} · ${m.description}`,
              date: m.due_date!,
              done: m.status === "completed",
              kind: "milestone",
            })),
          ...tasks
            .filter((x) => x.is_milestone_marker)
            .map<Delivery>((x) => ({
              label: x.name,
              date: x.end_date,
              done: x.status === "done",
              kind: "marker",
            })),
        ].sort((a, b) => t(a.date) - t(b.date));

        const openDue = deliveries.filter((d) => !d.done).map((d) => d.date);
        return {
          project: p,
          start: Math.min(...starts),
          end: Math.max(...ends),
          deliveries,
          finalDue: openDue[0] ?? p.end_date ?? null,
        };
      })
      .filter((x): x is Lane => x !== null);

    return rows.sort((a, b) => (t(a.finalDue) || a.end) - (t(b.finalDue) || b.end));
  }, [data, scope]);

  const range = useMemo(() => {
    if (!lanes.length) return null;
    const min = Math.min(...lanes.map((l) => l.start), Date.now());
    const max = Math.max(...lanes.map((l) => l.end), Date.now());
    const pad = Math.max((max - min) * 0.04, 3 * DAY);
    return { min: min - pad, max: max + pad };
  }, [lanes]);

  const months = useMemo(() => {
    if (!range) return [];
    const out: { label: string; left: number; width: number }[] = [];
    const span = range.max - range.min;
    const cursor = new Date(range.min);
    cursor.setDate(1);
    while (cursor.getTime() < range.max) {
      const startMs = Math.max(cursor.getTime(), range.min);
      const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).getTime();
      const endMs = Math.min(next, range.max);
      out.push({
        label: new Date(cursor).toLocaleDateString("th-TH", { month: "short", year: "2-digit" }),
        left: ((startMs - range.min) / span) * 100,
        width: ((endMs - startMs) / span) * 100,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return out;
  }, [range]);

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
        <p className="text-xs text-muted-foreground">
          ภาพรวมกำหนดส่งมอบของทุกโครงการ ก่อนมอบหมายงานให้สมาชิก
        </p>
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
          <div className="tile overflow-hidden p-0">
            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
                <div className="flex border-b bg-muted/40">
                  <div className="w-64 shrink-0 border-r px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    โครงการ
                  </div>
                  <div className="relative h-9 flex-1">
                    {months.map((m) => (
                      <div
                        key={m.label + m.left}
                        className="absolute top-0 h-full border-l text-[10px] text-muted-foreground"
                        style={{ left: `${m.left}%`, width: `${m.width}%` }}
                      >
                        <span className="pl-1.5 leading-9">{m.label}</span>
                      </div>
                    ))}
                    <div className="absolute top-0 h-full w-px bg-destructive" style={{ left: `${pct(Date.now())}%` }} />
                  </div>
                </div>

                {lanes.map((lane) => {
                  const p = lane.project;
                  const left = pct(lane.start);
                  const width = Math.max(pct(lane.end) - left, 0.6);
                  const dueIn = daysUntil(lane.finalDue);
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
                        </div>
                      </div>

                      <div className="relative min-h-[64px] flex-1">
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
                          className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-primary/25 ring-1 ring-inset ring-primary/40"
                          style={{ left: `${left}%`, width: `${width}%` }}
                        />
                        {lane.deliveries.map((d, i) => {
                          const late = !d.done && (daysUntil(d.date) ?? 0) < 0;
                          const color = d.done ? "bg-success" : late ? "bg-destructive" : "bg-primary";
                          return (
                            <Tooltip key={`${p.id}-${i}`}>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className={`absolute top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 rotate-45 items-center justify-center rounded-[3px] ring-2 ring-background ${color}`}
                                  style={{ left: `${pct(t(d.date))}%` }}
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
          <span className="h-3 w-px bg-destructive" />วันนี้
        </span>
      </div>
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
