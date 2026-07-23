import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, FileSignature, FolderKanban, CalendarClock, Flag } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { getSupabase } from "@/lib/supabase";
import { fmtDate, daysUntil } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [{ title: "ปฏิทินและกำหนดการ | Document Hub" }] }),
  component: CalendarPage,
});

type Ev = {
  id: string;
  title: string;
  date: string;
  kind: "contract_end" | "project_milestone" | "project_end" | "custom";
  module: string;
  link: string;
};

const KIND_META: Record<Ev["kind"], { label: string; icon: typeof FileSignature; cls: string }> = {
  contract_end: { label: "สัญญาสิ้นสุด", icon: FileSignature, cls: "bg-warning/20 text-warning-foreground" },
  project_milestone: { label: "งวดงานโครงการ", icon: Flag, cls: "bg-info/15 text-info" },
  project_end: { label: "โครงการสิ้นสุด", icon: FolderKanban, cls: "bg-primary/15 text-primary" },
  custom: { label: "กำหนดการอื่น", icon: CalendarClock, cls: "bg-muted text-muted-foreground" },
};

function CalendarPage() {
  const [selected, setSelected] = useState<Date | undefined>(new Date());

  const { data: events } = useQuery({
    queryKey: ["calendar-events"],
    queryFn: async (): Promise<Ev[]> => {
      const sb = getSupabase();
      const start = new Date();
      start.setDate(1);
      start.setMonth(start.getMonth() - 1);
      const end = new Date();
      end.setMonth(end.getMonth() + 6);
      const s = start.toISOString().slice(0, 10);
      const e = end.toISOString().slice(0, 10);

      const [contracts, milestones, projects, custom] = await Promise.all([
        sb.from("contracts").select("id, contract_no, title, end_date").gte("end_date", s).lte("end_date", e).neq("status", "archived"),
        sb.from("project_milestones").select("id, project_id, description, due_date, projects(name, code)").gte("due_date", s).lte("due_date", e),
        sb.from("projects").select("id, name, end_date").gte("end_date", s).lte("end_date", e),
        sb.from("calendar_events").select("id, title, event_date, module, record_id").gte("event_date", s).lte("event_date", e),
      ]);

      const list: Ev[] = [];
      (contracts.data ?? []).forEach((c: { id: string; contract_no: string | null; title: string; end_date: string }) => {
        list.push({
          id: `c-${c.id}`, title: `${c.contract_no ?? ""} · ${c.title}`, date: c.end_date,
          kind: "contract_end", module: "contract", link: `/contracts/${c.id}`,
        });
      });
      (milestones.data ?? []).forEach((m: { id: string; project_id: string; description: string; due_date: string | null; projects: { name: string; code: string | null } | { name: string; code: string | null }[] | null }) => {
        if (!m.due_date) return;
        const proj = Array.isArray(m.projects) ? m.projects[0] : m.projects;
        list.push({
          id: `m-${m.id}`, title: `${proj?.code ?? ""} · ${m.description}`, date: m.due_date,
          kind: "project_milestone", module: "project", link: `/projects/${m.project_id}`,
        });
      });
      (projects.data ?? []).forEach((pr: { id: string; name: string; end_date: string | null }) => {
        if (!pr.end_date) return;
        list.push({
          id: `pr-${pr.id}`, title: pr.name, date: pr.end_date,
          kind: "project_end", module: "project", link: `/projects/${pr.id}`,
        });
      });
      (custom.data ?? []).forEach((ev: { id: string; title: string; event_date: string }) => {
        list.push({
          id: `e-${ev.id}`, title: ev.title, date: ev.event_date,
          kind: "custom", module: "custom", link: "/calendar",
        });
      });
      return list.sort((a, b) => a.date.localeCompare(b.date));
    },
  });

  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>();
    (events ?? []).forEach((e) => {
      const arr = m.get(e.date) ?? [];
      arr.push(e);
      m.set(e.date, arr);
    });
    return m;
  }, [events]);

  const selectedKey = selected ? selected.toISOString().slice(0, 10) : null;
  const dayEvents = selectedKey ? byDay.get(selectedKey) ?? [] : [];

  const upcoming = (events ?? []).filter((e) => {
    const d = daysUntil(e.date);
    return d !== null && d >= 0 && d <= 30;
  }).slice(0, 15);

  const markedDates = Array.from(byDay.keys()).map((k) => new Date(k));

  return (
    <div className="space-y-6">
      <PageHeader title="ปฏิทินและกำหนดการ" description="ปฏิทินรวมทุกกำหนดการสำคัญ — สัญญา งวดงานโครงการ และกิจกรรม" />

      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        <Card>
          <CardContent className="p-3">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={setSelected}
              modifiers={{ event: markedDates }}
              modifiersClassNames={{
                event: "relative after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary",
              }}
            />
            <div className="mt-3 flex flex-wrap gap-2 border-t pt-3 text-[10px]">
              {Object.entries(KIND_META).map(([k, m]) => (
                <span key={k} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${m.cls}`}>
                  <m.icon className="h-3 w-3" />{m.label}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <CalendarDays className="mr-2 inline h-4 w-4" />
              กำหนดการวันที่ {selected ? fmtDate(selectedKey!) : "-"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dayEvents.length > 0 ? (
              <ul className="space-y-2">
                {dayEvents.map((ev) => {
                  const meta = KIND_META[ev.kind];
                  return (
                    <li key={ev.id}>
                      <Link to={ev.link} className="flex items-center gap-3 rounded-md border p-3 hover:bg-muted/40">
                        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${meta.cls}`}>
                          <meta.icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{ev.title}</div>
                          <div className="text-xs text-muted-foreground">{meta.label}</div>
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
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">กำหนดการ 30 วันข้างหน้า</CardTitle></CardHeader>
        <CardContent className="p-0">
          {upcoming.length > 0 ? (
            <ul className="divide-y">
              {upcoming.map((ev) => {
                const meta = KIND_META[ev.kind];
                const d = daysUntil(ev.date);
                return (
                  <li key={ev.id}>
                    <Link to={ev.link} className="flex items-center gap-3 p-3 hover:bg-muted/40">
                      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${meta.cls}`}>
                        <meta.icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{ev.title}</div>
                        <div className="text-xs text-muted-foreground">{meta.label} · {fmtDate(ev.date)}</div>
                      </div>
                      <Badge className={d !== null && d <= 7 ? "bg-destructive/15 text-destructive border-0" : "bg-muted text-muted-foreground border-0"}>
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
  );
}
