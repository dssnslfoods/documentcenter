import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-supabase";
import { usePageGuard } from "@/hooks/use-page-access";
import { fmtDate } from "@/lib/format";
import { CalendarClock, FolderKanban } from "lucide-react";

export const Route = createFileRoute("/_authenticated/assignments/execution")({
  head: () => ({
    meta: [
      { title: "การดำเนินโครงการ | Document Hub" },
      { name: "description", content: "งานที่ได้รับมอบหมายจากแผนการดำเนินโครงการทั้งหมดของคุณ" },
      { property: "og:title", content: "การดำเนินโครงการ | Document Hub" },
      { property: "og:description", content: "งานที่ได้รับมอบหมายจากแผนการดำเนินโครงการทั้งหมดของคุณ" },
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
  projects: { id: string; name: string; code: string | null } | null;
};

function AssignmentsExecution() {
  const guard = usePageGuard("assignments", "การมอบหมายงาน");
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["my-assigned-tasks", user?.id],
    enabled: !!user && guard.allowed,
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("project_tasks")
        .select("id, project_id, name, description, start_date, end_date, progress, status, projects(id, name, code)")
        .eq("assignee_id", user!.id)
        .order("end_date", { ascending: true });
      return (data ?? []) as unknown as Row[];
    },
  });

  if (!guard.allowed) return guard.node;

  const rows = data ?? [];
  const open = rows.filter((r) => r.status !== "done");
  const done = rows.filter((r) => r.status === "done");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="การดำเนินโครงการ"
        description="รายการงานที่คุณได้รับมอบหมายจากแผนการดำเนินงาน (Timeline) ของทุกโครงการ"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="งานที่ยังไม่เสร็จ" value={open.length} />
        <StatCard label="เลยกำหนด" value={open.filter((r) => r.end_date < today).length} />
        <StatCard label="เสร็จสิ้นแล้ว" value={done.length} />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            ยังไม่มีงานที่มอบหมายให้คุณในแผนการดำเนินโครงการ
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {[...open, ...done].map((t) => {
            const overdue = t.status !== "done" && t.end_date < today;
            return (
              <Card key={t.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{t.name}</span>
                      <Badge variant="outline" className={STATUS_META[t.status].badge}>
                        {STATUS_META[t.status].label}
                      </Badge>
                      {overdue && <Badge variant="destructive">เลยกำหนด</Badge>}
                    </div>
                    {t.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                    )}
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
                  <div className="w-full shrink-0 sm:w-40">
                    <Progress value={t.progress ?? 0} className="h-2" />
                    <div className="mt-1 text-right text-[11px] text-muted-foreground">{t.progress ?? 0}%</div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
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
