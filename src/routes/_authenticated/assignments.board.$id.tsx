import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarClock,
  ChevronDown,
  Hourglass,
  Layers,
  Loader2,
  MessageSquare,
  Send,
  UserPlus,
  UserMinus,
  Users,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-supabase";
import { usePageGuard } from "@/hooks/use-page-access";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import { fmtDate } from "@/lib/format";
import { TaskAssignmentDialog } from "@/components/project/task-assignment-dialog";
import { LIFECYCLE_LABEL, STATUS_TONE, type ProjectLifecycleStatus } from "@/lib/project-lifecycle";
import { ASSIGNMENT_META, type AssignmentStatus } from "@/lib/task-assignment";
import { ROLE_PERMISSIONS } from "@/lib/project-roles";

export const Route = createFileRoute("/_authenticated/assignments/board/$id")({
  head: () => ({
    meta: [
      { title: "ศูนย์มอบหมายงาน | Document Hub" },
      {
        name: "description",
        content: "หน้าจอเฉพาะสำหรับผู้บริหารโครงการ เลือกสมาชิกแล้วมอบหมายภารกิจลงบน Timeline ได้ทันที",
      },
      { property: "og:title", content: "ศูนย์มอบหมายงาน | Document Hub" },
      {
        property: "og:description",
        content: "หน้าจอเฉพาะสำหรับผู้บริหารโครงการ เลือกสมาชิกแล้วมอบหมายภารกิจลงบน Timeline ได้ทันที",
      },
    ],
  }),
  component: AssignmentBoard,
});

type Task = {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  progress: number;
  status: string;
  assignee_id: string | null;
  assignee_label: string | null;
  assignment_status: AssignmentStatus | null;
};

type Member = { id: string; memberId: string; name: string; role: string | null; position: string | null };

const BAR_TONE: Record<AssignmentStatus, string> = {
  draft: "bg-muted-foreground/25",
  assigned: "bg-warning/60",
  acknowledged: "bg-primary/60",
  in_review: "bg-primary",
  revision: "bg-destructive/60",
  accepted: "bg-success/70",
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function AssignmentBoard() {
  const { id } = Route.useParams();
  const sb = getSupabase();
  const qc = useQueryClient();
  const { user } = useAuth();
  const guard = usePageGuard("assignments", "การมอบหมายงาน");
  const perms = useProjectPermissions(id);

  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [quickTask, setQuickTask] = useState<Task | null>(null);
  const [missionTitle, setMissionTitle] = useState("");
  const [mission, setMission] = useState("");
  const [due, setDue] = useState("");
  const [threadTask, setThreadTask] = useState<string | null>(null);
  const [showLoad, setShowLoad] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);

  const workload = useQuery({
    queryKey: ["member-workload", selectedMember],
    enabled: guard.allowed && !!selectedMember && !!quickTask,
    queryFn: async () => {
      const { data } = await sb
        .from("project_tasks")
        .select("id, name, start_date, end_date, progress, assignment_status, project_id, projects(name)")
        .eq("assignee_id", selectedMember!)
        .order("start_date");
      return (data ?? []).map((r) => {
        const row = r as unknown as {
          id: string;
          name: string;
          start_date: string;
          end_date: string;
          progress: number | null;
          assignment_status: AssignmentStatus | null;
          project_id: string;
          projects: { name: string } | { name: string }[] | null;
        };
        const proj = Array.isArray(row.projects) ? row.projects[0] : row.projects;
        return { ...row, project_name: proj?.name ?? null };
      });
    },
  });



  const project = useQuery({
    queryKey: ["assignment-board-project", id],
    enabled: guard.allowed,
    queryFn: async () => {
      const { data } = await sb
        .from("projects")
        .select("id, name, code, status, progress")
        .eq("id", id)
        .maybeSingle();
      return data as { id: string; name: string; code: string | null; status: string; progress: number | null } | null;
    },
  });

  const members = useQuery({
    queryKey: ["assignment-board-members", id],
    enabled: guard.allowed,
    queryFn: async () => {
      const { data: mem } = await sb
        .from("project_members")
        .select("id, user_id, project_role, role_title")
        .eq("project_id", id);
      const rows = (mem ?? []) as {
        id: string;
        user_id: string | null;
        project_role: string | null;
        role_title: string | null;
      }[];
      const ids = rows.map((m) => m.user_id).filter(Boolean) as string[];
      if (!ids.length) return [] as Member[];
      const { data: profs } = await sb.from("profiles").select("id, full_name, email").in("id", ids);
      const byId = new Map((profs ?? []).map((p) => [p.id as string, p]));
      return rows.map((m) => {
        const p = byId.get(m.user_id!);
        return {
          id: m.user_id!,
          memberId: m.id,
          name: ((p?.full_name as string) || (p?.email as string) || "ไม่ทราบชื่อ") as string,
          role: m.project_role,
          position: m.role_title,
        };
      }) as Member[];
    },
  });

  const candidates = useQuery({
    queryKey: ["assignment-board-candidates"],
    enabled: guard.allowed && manageOpen,
    queryFn: async () => {
      const { data } = await sb
        .from("profiles")
        .select("id, full_name, email")
        .eq("is_active", true)
        .order("full_name");
      return (data ?? []) as { id: string; full_name: string | null; email: string | null }[];
    },
  });

  const addMember = useMutation({
    mutationFn: async (userId: string) => {
      const { data: inserted, error } = await sb
        .from("project_members")
        .insert({ project_id: id, user_id: userId, project_role: "staff" })
        .select("id")
        .single();
      if (error) throw error;
      const perms = ROLE_PERMISSIONS.staff;
      if (perms.length) {
        await sb
          .from("project_member_permissions")
          .insert(perms.map((k) => ({ project_member_id: inserted.id, permission_key: k, granted: true })));
      }
    },
    onSuccess: () => {
      toast.success("เพิ่มสมาชิกเข้าโครงการแล้ว");
      qc.invalidateQueries({ queryKey: ["assignment-board-members", id] });
      qc.invalidateQueries({ queryKey: ["project-members", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: async (m: Member) => {
      const { error } = await sb.from("project_members").delete().eq("id", m.memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("นำสมาชิกออกจากโครงการแล้ว");
      setSelectedMember(null);
      qc.invalidateQueries({ queryKey: ["assignment-board-members", id] });
      qc.invalidateQueries({ queryKey: ["project-members", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const tasks = useQuery({
    queryKey: ["assignment-board-tasks", id],
    enabled: guard.allowed,
    queryFn: async () => {
      const { data } = await sb
        .from("project_tasks")
        .select(
          "id, name, description, start_date, end_date, progress, status, assignee_id, assignee_label, assignment_status",
        )
        .eq("project_id", id)
        .order("start_date");
      return (data ?? []) as unknown as Task[];
    },
  });

  const canManage = !!perms.data?.canEditTimeline || !!perms.data?.isAdmin;
  const list = tasks.data ?? [];

  // ── ขั้นตอนปัจจุบันตามแผนงาน + นับถอยหลัง ──
  const todayTs = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);
  const dayLeft = (date: string) =>
    Math.round((new Date(`${date}T00:00:00`).getTime() - todayTs) / 86400000);

  const current = useMemo(() => {
    if (!list.length) return null;
    const running = list
      .filter((t) => t.status !== "completed")
      .filter((t) => dayLeft(t.start_date) <= 0 && dayLeft(t.end_date) >= 0)
      .sort((a, b) => dayLeft(a.end_date) - dayLeft(b.end_date));
    if (running.length) return { task: running[0], kind: "running" as const };
    const overdue = list
      .filter((t) => t.status !== "completed" && dayLeft(t.end_date) < 0)
      .sort((a, b) => dayLeft(b.end_date) - dayLeft(a.end_date));
    if (overdue.length) return { task: overdue[0], kind: "overdue" as const };
    const upcoming = list
      .filter((t) => t.status !== "completed" && dayLeft(t.start_date) > 0)
      .sort((a, b) => dayLeft(a.start_date) - dayLeft(b.start_date));
    if (upcoming.length) return { task: upcoming[0], kind: "upcoming" as const };
    return null;
  }, [list, todayTs]);


  const range = useMemo(() => {
    if (!list.length) return null;
    const min = list.reduce((a, t) => (t.start_date < a ? t.start_date : a), list[0].start_date);
    const max = list.reduce((a, t) => (t.end_date > a ? t.end_date : a), list[0].end_date);
    const s = new Date(min).getTime();
    const e = new Date(max).getTime();
    return { s, e, span: Math.max(1, e - s) };
  }, [list]);

  const bar = (t: Task) => {
    if (!range) return { left: "0%", width: "100%" };
    const s = new Date(t.start_date).getTime();
    const e = new Date(t.end_date).getTime();
    return {
      left: `${((s - range.s) / range.span) * 100}%`,
      width: `${Math.max(3, ((e - s) / range.span) * 100)}%`,
    };
  };

  const assign = useMutation({
    mutationFn: async () => {
      if (!quickTask || !selectedMember) throw new Error("กรุณาเลือกสมาชิกและงาน");
      const m = (members.data ?? []).find((x) => x.id === selectedMember);
      const title = missionTitle.trim();
      const detail = mission.trim();
      const endDate = due || quickTask.end_date;

      // มอบหมายแต่ละภารกิจเป็นงานย่อยใหม่เสมอ เพื่อไม่ให้ทับงานที่มอบหมายให้คนก่อนหน้า
      const { data: created, error } = await sb
        .from("project_tasks")
        .insert({
          project_id: id,
          parent_id: quickTask.id,
          name: title || quickTask.name,
          description: detail || null,
          start_date: quickTask.start_date,
          end_date: endDate,
          status: "not_started",
          progress: 0,
          assignee_id: selectedMember,
          assignee_label: m?.name ?? null,
          assignment_status: "assigned",
          assigned_at: new Date().toISOString(),
          assigned_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      const summary = [
        title || quickTask.name,
        m?.name ? `ผู้รับผิดชอบ: ${m.name}` : "",
        endDate ? `ส่งมอบ ${fmtDate(endDate)}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const { error: e2 } = await sb.from("project_task_updates").insert({
        task_id: created!.id,
        project_id: id,
        author_id: user!.id,
        kind: "assign",
        message: [summary, detail].filter(Boolean).join("\n"),
      });
      if (e2) throw e2;
    },

    onSuccess: () => {
      toast.success("มอบหมายภารกิจเรียบร้อย");
      setQuickTask(null);
      setMissionTitle("");
      setMission("");
      setDue("");
      qc.invalidateQueries({ queryKey: ["assignment-board-tasks", id] });
      qc.invalidateQueries({ queryKey: ["project-tasks", id] });
      qc.invalidateQueries({ queryKey: ["my-assigned-tasks"] });
      qc.invalidateQueries({ queryKey: ["tasks-i-assigned"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!guard.allowed) return guard.node;

  const p = project.data;
  const member = (members.data ?? []).find((m) => m.id === selectedMember) ?? null;
  const countFor = (uid: string) => list.filter((t) => t.assignee_id === uid).length;

  const winStart = quickTask?.start_date ?? "";
  const winEnd = due || quickTask?.end_date || "";
  const workloadRows = (workload.data ?? [])
    .filter((w) => w.id !== quickTask?.id && w.assignment_status !== "accepted")
    .map((w) => ({
      ...w,
      overlap: !!winStart && !!winEnd && w.start_date <= winEnd && w.end_date >= winStart,
    }));
  const overlapCount = workloadRows.filter((w) => w.overlap).length;


  const openQuick = (t: Task) => {
    if (!canManage) return;
    if (!selectedMember) {
      toast.info("เลือกสมาชิกทางด้านซ้ายก่อน แล้วจึงคลิกงานที่ต้องการมอบหมาย");
      return;
    }
    setQuickTask(t);
    setMissionTitle("");
    setMission(t.description ?? "");
    setDue(t.end_date);
  };

  return (
    <div className="space-y-5">
      <Link
        to="/assignments/project/$id"
        params={{ id }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        กลับไปหน้าแผนโครงการ
      </Link>

      <PageHeader
        title={p ? `ศูนย์มอบหมายงาน · ${p.name}` : "ศูนย์มอบหมายงาน"}
        description="เลือกสมาชิกทางซ้าย แล้วคลิกแถบงานบน Timeline เพื่อมอบหมายภารกิจ พร้อมกำหนดรายละเอียดและวันส่งมอบ"
      />

      {p && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={STATUS_TONE[p.status as ProjectLifecycleStatus]}>
            {LIFECYCLE_LABEL[p.status as ProjectLifecycleStatus] ?? p.status}
          </Badge>
          {p.code && <span className="text-xs text-muted-foreground">{p.code}</span>}
          <span className="text-xs text-muted-foreground">· {list.length} งานในแผน</span>
        </div>
      )}

      {current && (() => {
        const t = current.task;
        const left = dayLeft(t.end_date);
        const toStart = dayLeft(t.start_date);
        const tone =
          current.kind === "overdue"
            ? "border-destructive/40 bg-destructive/5"
            : current.kind === "upcoming"
              ? "border-muted-foreground/20 bg-muted/40"
              : left <= 2
                ? "border-warning/50 bg-warning/10"
                : "border-primary/40 bg-primary/5";
        const idx = list.findIndex((x) => x.id === t.id) + 1;
        const owner =
          t.assignee_label || (members.data ?? []).find((m) => m.id === t.assignee_id)?.name || "ยังไม่มอบหมาย";
        return (
          <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border p-4 ${tone}`}>
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {current.kind === "upcoming" ? "ขั้นตอนถัดไป" : "ขั้นตอนปัจจุบัน"} · ขั้นที่ {idx} จาก {list.length}
                </div>
                <div className="truncate text-base font-semibold">{t.name}</div>
                <div className="text-xs text-muted-foreground">
                  ผู้รับผิดชอบ {owner} · {fmtDate(t.start_date)} – {fmtDate(t.end_date)}
                </div>
              </div>
            </div>
            <div className="text-right">
              {current.kind === "overdue" ? (
                <>
                  <div className="text-2xl font-bold tabular-nums text-destructive">เลย {Math.abs(left)} วัน</div>
                  <div className="text-xs text-destructive">เกินกำหนดส่งมอบแล้ว</div>
                </>
              ) : current.kind === "upcoming" ? (
                <>
                  <div className="text-2xl font-bold tabular-nums">อีก {toStart} วัน</div>
                  <div className="text-xs text-muted-foreground">จะเริ่มขั้นตอนนี้</div>
                </>
              ) : (
                <>
                  <div className={`text-2xl font-bold tabular-nums ${left <= 2 ? "text-warning" : "text-primary"}`}>
                    {left === 0 ? "ครบกำหนดวันนี้" : `เหลือ ${left} วัน`}
                  </div>
                  <div className="text-xs text-muted-foreground">ถึงกำหนดส่งมอบ {fmtDate(t.end_date)}</div>
                </>
              )}
            </div>
          </div>
        );
      })()}



      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* ── สมาชิกโครงการ ── */}
        <Card className="lg:sticky lg:top-4 lg:self-start">
          <CardContent className="space-y-2 p-3">
            <div className="flex items-center gap-2 px-1 pb-1 text-sm font-medium">
              <Users className="h-4 w-4 text-primary" />
              สมาชิกโครงการ
              {canManage && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7 px-2 text-xs"
                  onClick={() => setManageOpen(true)}
                >
                  <UserPlus className="mr-1 h-3.5 w-3.5" />
                  เพิ่ม
                </Button>
              )}
            </div>
            {members.isLoading ? (
              <p className="px-1 text-xs text-muted-foreground">กำลังโหลด...</p>
            ) : (members.data ?? []).length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">ยังไม่มีสมาชิกในโครงการนี้</p>
            ) : (
              (members.data ?? []).map((m) => {
                const active = m.id === selectedMember;
                return (
                  <div
                    key={m.id}
                    className={`flex w-full items-center gap-2 rounded-lg border p-2 transition ${
                      active ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/60"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedMember(active ? null : m.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {initials(m.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{m.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {m.position || m.role || "สมาชิก"} · {countFor(m.id)} งาน
                        </span>
                      </span>
                    </button>
                    {canManage && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        title="นำออกจากโครงการ"
                        disabled={removeMember.isPending}
                        onClick={() => {
                          if (countFor(m.id) > 0) {
                            toast.error("สมาชิกคนนี้ยังมีงานที่รับผิดชอบอยู่ — โปรดย้ายงานก่อนนำออก");
                            return;
                          }
                          if (window.confirm(`นำ ${m.name} ออกจากโครงการ?`)) removeMember.mutate(m);
                        }}
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })
            )}
            {member && (
              <p className="rounded-md bg-primary/5 px-2 py-1.5 text-[11px] text-primary">
                กำลังมอบหมายให้ <strong>{member.name}</strong> — คลิกงานที่ต้องการทางขวา
              </p>
            )}

          </CardContent>
        </Card>

        {/* ── Timeline โฟกัส ── */}
        <Card>
          <CardContent className="space-y-2 p-3">
            {tasks.isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">กำลังโหลดแผนงาน...</p>
            ) : list.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                ยังไม่มีแผนงานในโครงการนี้ — เพิ่มแผนงานได้ที่แท็บ "ดำเนินโครงการ"
              </p>
            ) : (
              list.map((t) => {
                const st = (t.assignment_status ?? "draft") as AssignmentStatus;
                const owner =
                  t.assignee_label || (members.data ?? []).find((m) => m.id === t.assignee_id)?.name || "ยังไม่มอบหมาย";
                const mine = !!selectedMember && t.assignee_id === selectedMember;
                const isCurrent = current?.task.id === t.id;
                const left = dayLeft(t.end_date);
                return (
                  <div
                    key={t.id}
                    className={`rounded-lg border p-3 transition ${
                      isCurrent
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : mine
                          ? "border-primary/50 bg-primary/5"
                          : "hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {isCurrent && (
                        <Badge className="gap-1 bg-primary text-primary-foreground">
                          <Hourglass className="h-3 w-3" />
                          {current?.kind === "upcoming" ? "ขั้นตอนถัดไป" : "ขั้นตอนปัจจุบัน"}
                        </Badge>
                      )}
                      <span className="text-sm font-medium">{t.name}</span>
                      <Badge variant="outline" className={ASSIGNMENT_META[st].badge}>
                        {ASSIGNMENT_META[st].label}
                      </Badge>
                      {isCurrent && (
                        <span
                          className={`text-[11px] font-semibold ${left < 0 ? "text-destructive" : left <= 2 ? "text-warning" : "text-primary"}`}
                        >
                          {left < 0 ? `เลยกำหนด ${Math.abs(left)} วัน` : left === 0 ? "ครบกำหนดวันนี้" : `เหลืออีก ${left} วัน`}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground">· {owner}</span>

                      <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {fmtDate(t.start_date)} – {fmtDate(t.end_date)}
                      </span>
                    </div>

                    {t.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                    )}

                    <div className="mt-2 h-3 w-full rounded-full bg-muted/60">
                      <div className={`h-3 rounded-full ${BAR_TONE[st]}`} style={{ ...bar(t), position: "relative" }} />
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {canManage && (
                        <Button size="sm" variant={selectedMember ? "default" : "outline"} onClick={() => openQuick(t)}>
                          <Zap className="mr-2 h-4 w-4" />
                          มอบหมายภารกิจ
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setThreadTask(t.id)}>
                        <MessageSquare className="mr-2 h-4 w-4" />
                        ติดตาม / ตรวจรับ
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── มอบหมายด่วน ── */}
      <Dialog open={!!quickTask} onOpenChange={(v) => !v && setQuickTask(null)}>
        <DialogContent className="w-[95vw] max-w-lg">
          <DialogHeader>
            <DialogTitle className="pr-6 text-base">
              มอบหมาย: {quickTask?.name} → {member?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* ── ภาระงานปัจจุบันของสมาชิก ── */}
            <div className="rounded-lg border bg-muted/30">
              <button
                type="button"
                onClick={() => setShowLoad((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium"
              >
                <Layers className="h-4 w-4 text-primary" />
                ภาระงานปัจจุบันของ {member?.name ?? "สมาชิก"}
                <Badge variant="outline" className="ml-1">
                  {workload.isLoading ? "…" : `${workloadRows.length} งานค้าง`}
                </Badge>
                {overlapCount > 0 && (
                  <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning-foreground">
                    ทับช่วงเวลานี้ {overlapCount}
                  </Badge>
                )}
                <ChevronDown
                  className={`ml-auto h-4 w-4 text-muted-foreground transition ${showLoad ? "rotate-180" : ""}`}
                />
              </button>
              {showLoad && (
                <div className="max-h-52 space-y-1.5 overflow-y-auto border-t p-2">
                  {workload.isLoading ? (
                    <p className="px-1 py-2 text-xs text-muted-foreground">กำลังโหลดภาระงาน...</p>
                  ) : workloadRows.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-muted-foreground">ยังไม่มีงานค้างอยู่ — ว่างรับงานใหม่ได้</p>
                  ) : (
                    workloadRows.map((w) => {
                      const st = (w.assignment_status ?? "assigned") as AssignmentStatus;
                      return (
                        <div
                          key={w.id}
                          className={`rounded-md border p-2 text-xs ${
                            w.overlap ? "border-warning/50 bg-warning/10" : "bg-background"
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium">{w.name}</span>
                            <Badge variant="outline" className={ASSIGNMENT_META[st].badge}>
                              {ASSIGNMENT_META[st].label}
                            </Badge>
                            {w.overlap && <span className="text-[10px] text-warning-foreground">· ทับช่วงเวลา</span>}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <CalendarClock className="h-3 w-3" />
                              {fmtDate(w.start_date)} – {fmtDate(w.end_date)}
                            </span>
                            {w.project_name && <span>· {w.project_name}</span>}
                            <span>· {w.progress ?? 0}%</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>ชื่อภารกิจ</Label>
              <Input
                value={missionTitle}
                onChange={(e) => setMissionTitle(e.target.value)}
                placeholder="เช่น ออกแบบ mockup first draft"
              />
              <div className="flex flex-wrap gap-2 pt-1">
                {[
                  "ออกแบบ mockup first draft",
                  "จัดทำ artwork / layout",
                  "แก้ไขงานตาม comment",
                  "เตรียมไฟล์ส่งลูกค้า",
                ].map((t) => (
                  <Button key={t} type="button" size="sm" variant="outline" onClick={() => setMissionTitle(t)}>
                    {t}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>รายละเอียดภารกิจ</Label>
              <Textarea
                rows={3}
                value={mission}
                onChange={(e) => setMission(e.target.value)}
                placeholder="เช่น วาง layout หน้า 10-15 ส่งมอบไฟล์ต้นฉบับ"
              />
            </div>
            <div className="space-y-1.5">
              <Label>กำหนดส่งมอบ</Label>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              <div className="flex flex-wrap gap-2 pt-1">
                {[
                  { label: "วันนี้", v: addDays(0) },
                  { label: "พรุ่งนี้", v: addDays(1) },
                  { label: "3 วัน", v: addDays(3) },
                  { label: "1 สัปดาห์", v: addDays(7) },
                ].map((o) => (
                  <Button key={o.label} type="button" size="sm" variant="outline" onClick={() => setDue(o.v)}>
                    {o.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <span className="text-muted-foreground">สรุปคำสั่งงาน: </span>
              มอบหมายให้ <span className="font-medium">{member?.name ?? "สมาชิก"}</span>{" "}
              <span className="font-medium">{missionTitle.trim() || quickTask?.name}</span>
              {due ? ` ส่งมอบ ${fmtDate(due)}` : ""}
            </div>

            <Button className="w-full" disabled={assign.isPending} onClick={() => assign.mutate()}>
              {assign.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              ส่งมอบหมายให้สมาชิก
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── เพิ่มสมาชิกเข้าโครงการ ── */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle className="pr-6 text-base">เพิ่มสมาชิกเข้าโครงการ</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
            {candidates.isLoading ? (
              <p className="p-2 text-xs text-muted-foreground">กำลังโหลดรายชื่อ...</p>
            ) : (
              (() => {
                const existing = new Set((members.data ?? []).map((m) => m.id));
                const rows = (candidates.data ?? []).filter((c) => !existing.has(c.id));
                if (!rows.length)
                  return <p className="p-2 text-xs text-muted-foreground">ผู้ใช้ทุกคนอยู่ในโครงการนี้แล้ว</p>;
                return rows.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-md border p-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                      {initials(c.full_name || c.email || "?")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{c.full_name || c.email}</span>
                      {c.full_name && c.email && (
                        <span className="block truncate text-[11px] text-muted-foreground">{c.email}</span>
                      )}
                    </span>
                    <Button size="sm" disabled={addMember.isPending} onClick={() => addMember.mutate(c.id)}>
                      <UserPlus className="mr-1 h-3.5 w-3.5" />
                      เพิ่ม
                    </Button>
                  </div>
                ));
              })()
            )}
          </div>
        </DialogContent>
      </Dialog>

      <TaskAssignmentDialog

        taskId={threadTask}
        open={!!threadTask}
        onOpenChange={(v) => !v && setThreadTask(null)}
        canManage={canManage}
      />
    </div>
  );
}
