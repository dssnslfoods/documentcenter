import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-supabase";
import { usePageGuard } from "@/hooks/use-page-access";
import { fmtDate } from "@/lib/format";
import { CalendarClock, FolderKanban, MessagesSquare, Crown } from "lucide-react";
import { TaskAssignmentDialog } from "@/components/project/task-assignment-dialog";
import { ASSIGNMENT_META, type AssignmentStatus } from "@/lib/task-assignment";
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
  projects: { id: string; name: string; code: string | null } | null;
};

const SELECT =
  "id, project_id, name, description, start_date, end_date, progress, status, assignment_status, assignee_id, projects(id, name, code)";

type ExecProject = {
  id: string;
  name: string;
  code: string | null;
  status: string;
  progress: number | null;
  end_date: string | null;
};


function AssignmentsExecution() {
  const guard = usePageGuard("assignments", "การมอบหมายงาน");
  const { user } = useAuth();
  const [openTask, setOpenTask] = useState<{ id: string; manage: boolean } | null>(null);

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
        .filter((p): p is ExecProject => !!p && p.status !== "closed" && p.status !== "lost");
    },
  });

  if (!guard.allowed) return guard.node;

  const rows = mine.data ?? [];
  const open = rows.filter((r) => r.status !== "done");
  const done = rows.filter((r) => r.status === "done");
  const today = new Date().toISOString().slice(0, 10);
  const tracked = assigned.data ?? [];
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
                      to="/assignments/project/$id"
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
        <TabsList>
          <TabsTrigger value="mine">งานที่ได้รับมอบหมาย ({rows.length})</TabsTrigger>
          <TabsTrigger value="tracking">งานที่ฉันมอบหมาย ({tracked.length})</TabsTrigger>
        </TabsList>

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
            <div className="space-y-3">
              {[...open, ...done].map((t) => (
                <TaskCard key={t.id} t={t} today={today} onOpen={() => setOpenTask({ id: t.id, manage: false })} />
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
            tracked.map((t) => (
              <TaskCard key={t.id} t={t} today={today} onOpen={() => setOpenTask({ id: t.id, manage: true })} />
            ))
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

function TaskCard({ t, today, onOpen }: { t: Row; today: string; onOpen: () => void }) {
  const overdue = t.status !== "done" && t.end_date < today;
  const asg = (t.assignment_status ?? "draft") as AssignmentStatus;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{t.name}</span>
            <Badge variant="outline" className={STATUS_META[t.status].badge}>{STATUS_META[t.status].label}</Badge>
            <Badge variant="outline" className={ASSIGNMENT_META[asg].badge}>{ASSIGNMENT_META[asg].label}</Badge>
            {overdue && <Badge variant="destructive">เลยกำหนด</Badge>}
          </div>
          {t.description && <p className="line-clamp-2 text-xs text-muted-foreground">{t.description}</p>}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" />
              {fmtDate(t.start_date)} – {fmtDate(t.end_date)}
            </span>
            {t.projects && (
              <Link
                to="/projects/$id"
                params={{ id: t.project_id }}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <FolderKanban className="h-3.5 w-3.5" />
                {t.projects.code ? `${t.projects.code} · ` : ""}
                {t.projects.name}
              </Link>
            )}
          </div>
        </div>
        <div className="flex w-full shrink-0 items-center gap-3 sm:w-auto">
          <div className="w-full sm:w-32">
            <Progress value={t.progress ?? 0} className="h-2" />
            <div className="mt-1 text-right text-[11px] text-muted-foreground">{t.progress ?? 0}%</div>
          </div>
          <Button size="sm" variant="outline" onClick={onOpen}>
            <MessagesSquare className="mr-2 h-4 w-4" />เปิดงาน
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
