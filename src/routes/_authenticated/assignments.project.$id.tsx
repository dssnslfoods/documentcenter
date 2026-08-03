import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, CircleDot, UserCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getSupabase } from "@/lib/supabase";
import { usePageGuard } from "@/hooks/use-page-access";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import { fmtDate } from "@/lib/format";
import { TimelineTab } from "@/components/project/timeline-tab";
import { TaskAssignmentDialog } from "@/components/project/task-assignment-dialog";
import { LifecycleStepper } from "@/components/project/lifecycle-stepper";
import { LIFECYCLE_LABEL, STATUS_TONE, type ProjectLifecycleStatus } from "@/lib/project-lifecycle";
import { ASSIGNMENT_META, type AssignmentStatus } from "@/lib/task-assignment";

export const Route = createFileRoute("/_authenticated/assignments/project/$id")({
  head: () => ({
    meta: [
      { title: "แผนการดำเนินโครงการ | Document Hub" },
      { name: "description", content: "ดูแผนการดำเนินโครงการแบบเต็มหน้าจอ ตรวจสอบขั้นตอนปัจจุบัน และมอบหมายงานให้สมาชิก" },
      { property: "og:title", content: "แผนการดำเนินโครงการ | Document Hub" },
      { property: "og:description", content: "ดูแผนการดำเนินโครงการแบบเต็มหน้าจอ ตรวจสอบขั้นตอนปัจจุบัน และมอบหมายงานให้สมาชิก" },
    ],
  }),
  component: AssignmentProjectTimeline,
});

type Task = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  progress: number;
  status: "not_started" | "in_progress" | "done" | "blocked";
  assignee_id: string | null;
  assignee_label: string | null;
  assignment_status: AssignmentStatus | null;
};

function AssignmentProjectTimeline() {
  const { id } = Route.useParams();
  const guard = usePageGuard("assignments", "การมอบหมายงาน");
  const perms = useProjectPermissions(id);
  const [openTask, setOpenTask] = useState<string | null>(null);

  const project = useQuery({
    queryKey: ["assignment-project", id],
    enabled: guard.allowed,
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("projects")
        .select("id, name, code, status, progress, start_date, end_date")
        .eq("id", id)
        .maybeSingle();
      return data as {
        id: string;
        name: string;
        code: string | null;
        status: string;
        progress: number | null;
        start_date: string | null;
        end_date: string | null;
      } | null;
    },
  });

  const tasks = useQuery({
    queryKey: ["assignment-project-tasks", id],
    enabled: guard.allowed,
    retry: false,
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("project_tasks")
        .select("id, name, start_date, end_date, progress, status, assignee_id, assignee_label, assignment_status")
        .eq("project_id", id)
        .order("start_date");
      return (data ?? []) as unknown as Task[];
    },
  });

  const today = new Date().toISOString().slice(0, 10);

  const { current, upcoming } = useMemo(() => {
    const all = tasks.data ?? [];
    const pending = all.filter((t) => t.status !== "done");
    const cur = pending.filter((t) => t.start_date <= today && t.end_date >= today);
    const late = pending.filter((t) => t.end_date < today);
    const next = pending.filter((t) => t.start_date > today).slice(0, 3);
    return { current: [...late, ...cur], upcoming: next };
  }, [tasks.data, today]);

  if (!guard.allowed) return guard.node;

  const p = project.data;
  const canManage = !!perms.data?.canEditTimeline || !!perms.data?.isAdmin;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/assignments/execution"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          กลับไปหน้าการดำเนินโครงการ
        </Link>
      </div>

      <PageHeader
        title={p ? `${p.code ? `${p.code} · ` : ""}${p.name}` : "แผนการดำเนินโครงการ"}
        description="แผนการดำเนินงานแบบเต็มหน้าจอ — เลือกขั้นตอนที่ต้องการ แล้วมอบหมายงานให้สมาชิกโครงการ"
      />

      {p && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={STATUS_TONE[p.status as ProjectLifecycleStatus]}>
                ขั้นตอนปัจจุบัน: {LIFECYCLE_LABEL[p.status as ProjectLifecycleStatus] ?? p.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {p.start_date ? fmtDate(p.start_date) : "—"} – {p.end_date ? fmtDate(p.end_date) : "—"}
              </span>
            </div>
            <LifecycleStepper status={p.status as ProjectLifecycleStatus} />
            <div>
              <Progress value={p.progress ?? 0} className="h-2" />
              <div className="mt-1 text-right text-[11px] text-muted-foreground">
                ความคืบหน้าโครงการ {p.progress ?? 0}%
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CircleDot className="h-4 w-4 text-primary" />
          ขั้นตอนที่ต้องดำเนินการตอนนี้
        </div>
        {tasks.isLoading ? (
          <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
        ) : current.length === 0 && upcoming.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              ยังไม่มีแผนการดำเนินงานในโครงการนี้ — เพิ่มแผนงานได้จากตาราง Gantt ด้านล่าง
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {[...current, ...upcoming].map((t) => {
              const asg = (t.assignment_status ?? "draft") as AssignmentStatus;
              const overdue = t.end_date < today;
              const active = current.some((c) => c.id === t.id);
              return (
                <Card key={t.id} className={active ? "border-primary/40" : undefined}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{t.name}</span>
                      <Badge variant="outline" className={ASSIGNMENT_META[asg].badge}>
                        {ASSIGNMENT_META[asg].label}
                      </Badge>
                      {overdue && <Badge variant="destructive">เลยกำหนด</Badge>}
                      {!active && <Badge variant="outline">ขั้นตอนถัดไป</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {fmtDate(t.start_date)} – {fmtDate(t.end_date)}
                      </span>
                      <span>ผู้รับผิดชอบ: {t.assignee_label || "ยังไม่ระบุ"}</span>
                    </div>
                    <Progress value={t.progress ?? 0} className="h-2" />
                    <Button size="sm" variant="outline" onClick={() => setOpenTask(t.id)}>
                      <UserCheck className="mr-2 h-4 w-4" />
                      {canManage ? "ไปที่ขั้นตอนนี้ / มอบหมายสมาชิก" : "ไปที่ขั้นตอนนี้"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <TimelineTab projectId={id} projectName={p?.name} canEdit={canManage} />

      <TaskAssignmentDialog
        taskId={openTask}
        open={!!openTask}
        onOpenChange={(v) => !v && setOpenTask(null)}
        canManage={canManage}
      />
    </div>
  );
}
