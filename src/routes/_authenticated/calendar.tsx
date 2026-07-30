import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  FileSignature,
  FolderKanban,
  CalendarClock,
  Flag,
  GanttChartSquare,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getSupabase } from "@/lib/supabase";
import { fmtDate, daysUntil } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [{ title: "ปฏิทินและกำหนดการ | Document Hub" }] }),
  component: CalendarPage,
});

type Kind = "contract_end" | "project_milestone" | "project_end" | "project_task" | "custom";

type Ev = {
  id: string;
  title: string;
  start: string;
  end: string;
  kind: Kind;
  link: string;
  sub?: string;
};

const KIND_META: Record<Kind, { label: string; icon: typeof FileSignature; cls: string; bar: string }> = {
  contract_end: {
    label: "สัญญาสิ้นสุด",
    icon: FileSignature,
    cls: "bg-warning/20 text-warning-foreground",
    bar: "bg-warning/30 text-warning-foreground",
  },
  project_milestone: {
    label: "งวดงานโครงการ",
    icon: Flag,
    cls: "bg-info/15 text-info",
    bar: "bg-info/20 text-info",
  },
  project_end: {
    label: "โครงการสิ้นสุด",
    icon: FolderKanban,
    cls: "bg-primary/15 text-primary",
    bar: "bg-primary/20 text-primary",
  },
  project_task: {
    label: "แผนงานโครงการ (Timeline)",
    icon: GanttChartSquare,
    cls: "bg-success/15 text-success",
    bar: "bg-success/25 text-success",
  },
  custom: {
    label: "กำหนดการอื่น",
    icon: CalendarClock,
    cls: "bg-muted text-muted-foreground",
    bar: "bg-muted text-muted-foreground",
  },
};

const iso = (d: Date) => {
  const c = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return c.toISOString().slice(0, 10);
};
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const TH_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const TH_DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function CalendarPage() {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<string>(iso(today));
  const [hidden, setHidden] = useState<Set<Kind>>(new Set());

  const { data: events } = useQuery({
    queryKey: ["calendar-events-v2"],
    queryFn: async (): Promise<Ev[]> => {
      const sb = getSupabase();
      const start = new Date();
      start.setDate(1);
      start.setMonth(start.getMonth() - 6);
      const end = new Date();
      end.setMonth(end.getMonth() + 12);
      const s = iso(start);
      const e = iso(end);

      const [contracts, milestones, projects, custom, tasks] = await Promise.all([
        sb.from("contracts").select("id, contract_no, title, end_date").gte("end_date", s).lte("end_date", e).neq("status", "archived"),
        sb.from("project_milestones").select("id, project_id, description, due_date, projects(name, code)").gte("due_date", s).lte("due_date", e),
        sb.from("projects").select("id, name, end_date").gte("end_date", s).lte("end_date", e),
        sb.from("calendar_events").select("id, title, event_date, module, record_id").gte("event_date", s).lte("event_date", e),
        // RLS on project_tasks limits rows to projects the user is a member of (or admin)
        sb.from("project_tasks").select("id, project_id, name, start_date, end_date, status, progress, assignee_label, projects(name, code)").lte("start_date", e).gte("end_date", s),
      ]);

      const list: Ev[] = [];
      (contracts.data ?? []).forEach((c: { id: string; contract_no: string | null; title: string; end_date: string }) => {
        list.push({ id: `c-${c.id}`, title: `${c.contract_no ?? ""} · ${c.title}`, start: c.end_date, end: c.end_date, kind: "contract_end", link: `/contracts/${c.id}` });
      });
      (milestones.data ?? []).forEach((m: { id: string; project_id: string; description: string; due_date: string | null; projects: { name: string; code: string | null } | { name: string; code: string | null }[] | null }) => {
        if (!m.due_date) return;
        const proj = Array.isArray(m.projects) ? m.projects[0] : m.projects;
        list.push({ id: `m-${m.id}`, title: `${proj?.code ?? ""} · ${m.description}`, start: m.due_date, end: m.due_date, kind: "project_milestone", link: `/projects/${m.project_id}` });
      });
      (projects.data ?? []).forEach((pr: { id: string; name: string; end_date: string | null }) => {
        if (!pr.end_date) return;
        list.push({ id: `pr-${pr.id}`, title: pr.name, start: pr.end_date, end: pr.end_date, kind: "project_end", link: `/projects/${pr.id}` });
      });
      (custom.data ?? []).forEach((ev: { id: string; title: string; event_date: string }) => {
        list.push({ id: `e-${ev.id}`, title: ev.title, start: ev.event_date, end: ev.event_date, kind: "custom", link: "/calendar" });
      });
      if (!tasks.error) {
        (tasks.data ?? []).forEach((t: { id: string; project_id: string; name: string; start_date: string; end_date: string; progress: number | null; assignee_label: string | null; projects: { name: string; code: string | null } | { name: string; code: string | null }[] | null }) => {
          const proj = Array.isArray(t.projects) ? t.projects[0] : t.projects;
          list.push({
            id: `t-${t.id}`,
            title: t.name,
            sub: [proj?.code ?? proj?.name, t.assignee_label ?? undefined, `${t.progress ?? 0}%`].filter(Boolean).join(" · "),
            start: t.start_date,
            end: t.end_date < t.start_date ? t.start_date : t.end_date,
            kind: "project_task",
            link: `/projects/${t.project_id}`,
          });
        });
      }
      return list.sort((a, b) => a.start.localeCompare(b.start));
    },
  });

  const visible = useMemo(() => (events ?? []).filter((e) => !hidden.has(e.kind)), [events, hidden]);

  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>();
    visible.forEach((e) => {
      const s = parse(e.start);
      const en = parse(e.end);
      for (let d = new Date(s); d <= en; d.setDate(d.getDate() + 1)) {
        const k = iso(d);
        const arr = m.get(k) ?? [];
        arr.push(e);
        m.set(k, arr);
      }
    });
    return m;
  }, [visible]);

  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startGrid = new Date(first);
    startGrid.setDate(1 - first.getDay());
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(startGrid);
      d.setDate(startGrid.getDate() + i);
      days.push(d);
    }
    return days;
  }, [cursor]);

  const dayEvents = byDay.get(selected) ?? [];
  const todayKey = iso(today);

  const upcoming = visible
    .filter((e) => {
      const d = daysUntil(e.start);
      return d !== null && d >= 0 && d <= 30;
    })
    .slice(0, 15);

  const toggleKind = (k: Kind) =>
    setHidden((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <div className="space-y-4">
      <PageHeader
        title="ปฏิทินและกำหนดการ"
        description="ปฏิทินรวมทุกกำหนดการสำคัญ — สัญญา งวดงาน แผนงานโครงการ (เฉพาะโครงการที่คุณอยู่ในทีม) และกิจกรรม"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-44 text-center text-lg font-semibold">
            {TH_MONTHS[cursor.getMonth()]} {cursor.getFullYear() + 543}
          </div>
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
              setSelected(todayKey);
            }}
          >
            วันนี้
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          {(Object.keys(KIND_META) as Kind[]).map((k) => {
            const m = KIND_META[k];
            const off = hidden.has(k);
            return (
              <button
                key={k}
                onClick={() => toggleKind(k)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition",
                  m.cls,
                  off && "opacity-35 grayscale",
                )}
              >
                <m.icon className="h-3 w-3" />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="grid grid-cols-7 border-b bg-muted/40">
              {TH_DOW.map((d) => (
                <div key={d} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {grid.map((d) => {
                const key = iso(d);
                const evs = byDay.get(key) ?? [];
                const outside = d.getMonth() !== cursor.getMonth();
                return (
                  <button
                    key={key}
                    onClick={() => setSelected(key)}
                    className={cn(
                      "min-h-28 border-b border-r p-1.5 text-left align-top transition hover:bg-muted/40",
                      outside && "bg-muted/20 text-muted-foreground",
                      selected === key && "ring-2 ring-inset ring-primary",
                    )}
                  >
                    <span
                      className={cn(
                        "mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                        key === todayKey && "bg-primary text-primary-foreground",
                      )}
                    >
                      {d.getDate()}
                    </span>
                    <div className="space-y-0.5">
                      {evs.slice(0, 3).map((ev) => (
                        <div
                          key={ev.id}
                          title={ev.title}
                          className={cn("truncate rounded px-1 py-0.5 text-[10px] leading-tight", KIND_META[ev.kind].bar)}
                        >
                          {ev.title}
                        </div>
                      ))}
                      {evs.length > 3 && (
                        <div className="px-1 text-[10px] text-muted-foreground">+{evs.length - 3} รายการ</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                <CalendarDays className="mr-2 inline h-4 w-4" />
                {fmtDate(selected)}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {dayEvents.length > 0 ? (
                <ul className="divide-y">
                  {dayEvents.map((ev) => {
                    const meta = KIND_META[ev.kind];
                    return (
                      <li key={ev.id}>
                        <Link to={ev.link} className="flex items-center gap-3 p-3 hover:bg-muted/40">
                          <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md", meta.cls)}>
                            <meta.icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{ev.title}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {ev.sub ? `${meta.label} · ${ev.sub}` : meta.label}
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">ไม่มีกำหนดการในวันนี้</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">30 วันข้างหน้า</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {upcoming.length > 0 ? (
                <ul className="divide-y">
                  {upcoming.map((ev) => {
                    const meta = KIND_META[ev.kind];
                    const d = daysUntil(ev.start);
                    return (
                      <li key={ev.id}>
                        <Link to={ev.link} className="flex items-center gap-3 p-3 hover:bg-muted/40">
                          <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md", meta.cls)}>
                            <meta.icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{ev.title}</div>
                            <div className="truncate text-xs text-muted-foreground">{meta.label} · {fmtDate(ev.start)}</div>
                          </div>
                          <Badge className={d !== null && d <= 7 ? "border-0 bg-destructive/15 text-destructive" : "border-0 bg-muted text-muted-foreground"}>
                            {d === 0 ? "วันนี้" : `อีก ${d} วัน`}
                          </Badge>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">ไม่มีกำหนดการ 30 วันข้างหน้า</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
