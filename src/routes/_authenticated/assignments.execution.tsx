import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-supabase";
import { usePageGuard } from "@/hooks/use-page-access";
import { fmtDate, daysUntil } from "@/lib/format";
import { Crown, UserRound, ArrowUpDown, Tag, FolderKanban, MessagesSquare } from "lucide-react";
import { akaBadgeClass } from "@/lib/aka-colors";
import { TaskAssignmentDialog } from "@/components/project/task-assignment-dialog";
import { ASSIGNMENT_META, splitMissions, type AssignmentStatus } from "@/lib/task-assignment";
import { LIFECYCLE_LABEL, STATUS_TONE, type ProjectLifecycleStatus } from "@/lib/project-lifecycle";

export const Route = createFileRoute("/_authenticated/assignments/execution")({
  head: () => ({
    meta: [
      { title: "การดำเนินโครงการ | Document Hub" },
      { name: "description", content: "มอบหมาย รับทราบ ส่ง feedback และส่งมอบงานจากแผนการดำเนินโครงการ" },
      { property: "og:title", content: "การดำเนินโครงการ | Document Hub" },
      { property: "og:description", content: "มอบหมาย รับทราบ ส่ง feedback และส่งมอบงานจากแผนการดำเนินโครงการ" },
    ],
  }),
  component: AssignmentsExecution,
});

type TaskStatus = "not_started" | "in_progress" | "done" | "blocked";

const STATUS_META: Record<TaskStatus, { label: string; badge: string }> = {
  not_started: { label: "ยังไม่เริ่ม", badge: "border-muted-foreground/30 text-muted-foreground" },
  in_progress: { label: "กำลังดำเนินการ", badge: "border-primary/40 text-primary" },
  done: { label: "เสร็จสิ้น", badge: "border-success/40 text-success" },
  blocked: { label: "ติดปัญหา", badge: "border-destructive/40 text-destructive" },
};

type Row = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  progress: number;
  status: TaskStatus;
  assignment_status: AssignmentStatus | null;
  assignee_id: string | null;
  projects: { id: string; name: string; code: string | null; customer_aka: string | null; customer_aka_color: string | null } | null;
};

const SELECT =
  "id, project_id, name, description, start_date, end_date, progress, status, assignment_status, assignee_id, projects(id, name, code, customer_aka, customer_aka_color)";

type ExecProject = {
  id: string;
  name: string;
  code: string | null;
  status: string;
  progress: number | null;
  end_date: string | null;
};

type SortKey = "end_date" | "start_date" | "progress" | "status" | "assignment_status" | "project" | "name";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "end_date", label: "กำหนดส่งมอบ" },
  { value: "start_date", label: "วันเริ่มงาน" },
  { value: "progress", label: "ความคืบหน้า" },
  { value: "status", label: "สถานะงาน" },
  { value: "assignment_status", label: "สถานะการมอบหมาย" },
  { value: "project", label: "โครงการ" },
  { value: "name", label: "ชื่อภารกิจ" },
];

const STATUS_ORDER: Record<TaskStatus, number> = { blocked: 0, in_progress: 1, not_started: 2, done: 3 };
const ASG_ORDER: Record<AssignmentStatus, number> = {
  revision: 0,
  assigned: 1,
  acknowledged: 2,
  in_review: 3,
  draft: 4,
  accepted: 5,
};

function sortCards(rows: MissionCard[], key: SortKey, dir: SortDir): MissionCard[] {
  const sign = dir === "asc" ? 1 : -1;
  const cmp = (a: MissionCard, b: MissionCard): number => {
    switch (key) {
      case "end_date":
        return a.end_date.localeCompare(b.end_date);
      case "start_date":
        return a.start_date.localeCompare(b.start_date);
      case "progress":
        return (a.progress ?? 0) - (b.progress ?? 0);
      case "status":
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      case "assignment_status":
        return (
          ASG_ORDER[(a.assignment_status ?? "draft") as AssignmentStatus] -
          ASG_ORDER[(b.assignment_status ?? "draft") as AssignmentStatus]
        );
      case "project":
        return (a.projects?.name ?? "").localeCompare(b.projects?.name ?? "", "th");
      case "name":
        return (a.missionTitle ?? a.name).localeCompare(b.missionTitle ?? b.name, "th");
    }
  };
  return [...rows].sort((a, b) => sign * cmp(a, b));
}


function AssignmentsExecution() {
  const guard = usePageGuard("assignments", "การมอบหมายงาน");
  const { user } = useAuth();
  const [openTask, setOpenTask] = useState<{ id: string; manage: boolean } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("end_date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const mine = useQuery({
    queryKey: ["my-assigned-tasks", user?.id],
    enabled: !!user && guard.allowed,
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("project_tasks")
        .select(SELECT)
        .eq("assignee_id", user!.id)
        .order("end_date", { ascending: true });
      return (data ?? []) as unknown as Row[];
    },
  });

  const assigned = useQuery({
    queryKey: ["tasks-i-assigned", user?.id],
    enabled: !!user && guard.allowed,
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("project_tasks")
        .select(SELECT)
        .eq("assigned_by", user!.id)
        .neq("assignee_id", user!.id)
        .order("end_date", { ascending: true });
      return (data ?? []) as unknown as Row[];
    },
  });

  const execProjects = useQuery({
    queryKey: ["projects-i-lead", user?.id],
    enabled: !!user && guard.allowed,
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("project_members")
        .select("project_role, projects(id, name, code, status, progress, end_date)")
        .eq("user_id", user!.id)
        .eq("project_role", "exec");
      return (data ?? [])
        .map((r) => (r as unknown as { projects: ExecProject | null }).projects)
        .filter(
          (p): p is ExecProject =>
            !!p && p.status !== "completed" && p.status !== "lost"
        );
    },
  });

  const assigneeIds = Array.from(
    new Set(
      [...(mine.data ?? []), ...(assigned.data ?? [])]
        .map((t) => t.assignee_id)
        .filter((v): v is string => !!v)
    )
  );

  const profiles = useQuery({
    queryKey: ["task-assignee-profiles", assigneeIds.join(",")],
    enabled: assigneeIds.length > 0,
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("profiles")
        .select("id, full_name, email")
        .in("id", assigneeIds);
      const map: Record<string, string> = {};
      for (const p of (data ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
        map[p.id] = p.full_name || p.email || "ไม่ทราบชื่อ";
      }
      return map;
    },
  });

  if (!guard.allowed) return guard.node;

  const nameOf = (id: string | null) => (id ? profiles.data?.[id] ?? "…" : "ยังไม่ระบุผู้รับผิดชอบ");
  const rows = sortCards(toMissionCards(mine.data ?? []), sortKey, sortDir);
  const open = rows.filter((r) => r.status !== "done");
  const done = rows.filter((r) => r.status === "done");
  const today = new Date().toISOString().slice(0, 10);
  const tracked = sortCards(toMissionCards(assigned.data ?? []), sortKey, sortDir);
  const led = execProjects.data ?? [];


  return (
    <div className="space-y-6">
      <PageHeader
        title="มอบหมายและติดตามงานสมาชิก"
        description="ผู้บริหารโครงการมอบหมายงานจากแผนการดำเนินงาน (Timeline) — สมาชิกกดรับทราบ ส่ง feedback และส่งมอบงานให้ผู้บริหารตรวจรับ"
      />

      {led.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Crown className="h-4 w-4 text-primary" />
            โครงการที่คุณเป็นผู้บริหารโครงการ ({led.length})
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {led.map((p) => (
              <Card key={p.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to="/assignments/board/$id"
                      params={{ id: p.id }}
                      className="min-w-0 font-medium text-primary hover:underline"
                    >
                      <span className="line-clamp-2">
                        {p.code ? `${p.code} · ` : ""}
                        {p.name}
                      </span>
                    </Link>
                    <Badge variant="outline" className={STATUS_TONE[p.status as ProjectLifecycleStatus]}>
                      {LIFECYCLE_LABEL[p.status as ProjectLifecycleStatus] ?? p.status}
                    </Badge>
                  </div>
                  <Progress value={p.progress ?? 0} className="h-2" />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{p.end_date ? `สิ้นสุด ${fmtDate(p.end_date)}` : "ไม่ระบุวันสิ้นสุด"}</span>
                    <span>{p.progress ?? 0}%</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}


      <Tabs defaultValue="mine">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="mine">งานที่ได้รับมอบหมาย ({rows.length})</TabsTrigger>
            <TabsTrigger value="tracking">งานที่ฉันมอบหมาย ({tracked.length})</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">เรียงตาม</span>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="h-9 w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortDir} onValueChange={(v) => setSortDir(v as SortDir)}>
              <SelectTrigger className="h-9 w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">น้อย → มาก</SelectItem>
                <SelectItem value="desc">มาก → น้อย</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>


        <TabsContent value="mine" className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="งานที่ยังไม่เสร็จ" value={open.length} />
            <StatCard label="เลยกำหนด" value={open.filter((r) => r.end_date < today).length} />
            <StatCard label="เสร็จสิ้นแล้ว" value={done.length} />
          </div>

          {mine.isLoading ? (
            <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                ยังไม่มีงานที่มอบหมายให้คุณในแผนการดำเนินโครงการ
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {[...open, ...done].map((t, i) => (
                <TaskCard key={`${t.id}-${i}`} t={t} today={today} assigneeName={nameOf(t.assignee_id)} onOpen={() => setOpenTask({ id: t.id, manage: false })} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tracking" className="space-y-3 pt-4">
          {assigned.isLoading ? (
            <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
          ) : tracked.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                ยังไม่มีงานที่คุณมอบหมายให้สมาชิก — เปิดโครงการ → แท็บ “ดำเนินโครงการ” แล้วเลือกงานเพื่อมอบหมาย
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {tracked.map((t, i) => (
                <TaskCard key={`${t.id}-${i}`} t={t} today={today} assigneeName={nameOf(t.assignee_id)} onOpen={() => setOpenTask({ id: t.id, manage: true })} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <TaskAssignmentDialog
        taskId={openTask?.id ?? null}
        open={!!openTask}
        onOpenChange={(v) => !v && setOpenTask(null)}
        canManage={!!openTask?.manage}
      />
    </div>
  );
}

type MissionCard = Row & { missionTitle: string | null; missionNote: string };

/** 1 ภารกิจ = 1 การ์ด (งานที่มีหลายภารกิจจะถูกแยกออกจากกัน) */
function toMissionCards(rows: Row[]): MissionCard[] {
  return rows.flatMap((t): MissionCard[] => {
    const { missions, note } = splitMissions(t.description);
    if (missions.length === 0) return [{ ...t, missionTitle: null, missionNote: note }];
    return missions.map((m) => ({ ...t, missionTitle: m, missionNote: note }));
  });

}

function TaskCard({ t, today, assigneeName, onOpen }: { t: MissionCard; today: string; assigneeName: string; onOpen: () => void }) {
  const overdue = t.status !== "done" && t.end_date < today;
  const asg = (t.assignment_status ?? "draft") as AssignmentStatus;
  const remaining = daysUntil(t.end_date);
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                <UserRound className="h-3 w-3" />
                {assigneeName}
              </span>
            </div>
            <p className="mt-1 line-clamp-1 text-sm font-medium">{t.missionTitle ?? t.name}</p>
            {t.missionTitle && (
              <p className="line-clamp-1 text-[10px] text-muted-foreground">งานในแผน: {t.name}</p>
            )}
          </div>
          <div className={`flex shrink-0 flex-col items-center rounded-md border px-2 py-1 ${overdue ? "border-destructive/40 bg-destructive/10" : "border-primary/30 bg-primary/10"}`}>
            <div className="text-[10px] text-muted-foreground">ส่งมอบ</div>
            <div className={`text-xs font-semibold ${overdue ? "text-destructive" : "text-primary"}`}>
              {fmtDate(t.end_date)}
            </div>
            {t.status === "done" ? (
              <div className="text-[10px] font-medium text-success">เสร็จสิ้น</div>
            ) : remaining == null ? null : remaining < 0 ? (
              <div className="text-[10px] font-semibold text-destructive">เลย {Math.abs(remaining)} วัน</div>
            ) : remaining === 0 ? (
              <div className="text-[10px] font-semibold text-warning">วันนี้</div>
            ) : (
              <div className="text-[10px] font-semibold text-primary">เหลือ {remaining} วัน</div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={`text-[10px] ${STATUS_META[t.status].badge}`}>{STATUS_META[t.status].label}</Badge>
          <Badge variant="outline" className={`text-[10px] ${ASSIGNMENT_META[asg].badge}`}>{ASSIGNMENT_META[asg].label}</Badge>
          {overdue && <Badge variant="destructive" className="text-[10px]">เลยกำหนด</Badge>}
        </div>

        {t.missionNote && <p className="line-clamp-2 text-[11px] text-muted-foreground">{t.missionNote}</p>}

        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
          {t.projects && (
            <Link
              to="/projects/$id"
              params={{ id: t.project_id }}
              className="inline-flex items-center gap-1 rounded-md border border-muted-foreground/30 bg-muted/50 px-1.5 py-0.5 font-medium text-foreground hover:bg-muted"
            >
              <FolderKanban className="h-3 w-3" />
              {t.projects.code ? `${t.projects.code} · ` : ""}
              {t.projects.name}
            </Link>
          )}
          {t.projects?.customer_aka && (
            <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ${akaBadgeClass(t.projects.customer_aka_color)}`}>
              <Tag className="h-3 w-3" />
              {t.projects.customer_aka}
            </span>
          )}
        </div>

        <div className="mt-auto flex items-center gap-2 pt-1">
          <div className="flex-1">
            <Progress value={t.progress ?? 0} className="h-1.5" />
            <div className="mt-0.5 text-right text-[10px] text-muted-foreground">{t.progress ?? 0}%</div>
          </div>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onOpen}>
            <MessagesSquare className="mr-1.5 h-3.5 w-3.5" />เปิดงาน
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
