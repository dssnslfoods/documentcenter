import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-supabase";
import { usePageGuard } from "@/hooks/use-page-access";
import { fmtDateTime, fmtDate } from "@/lib/format";
import { ASSIGNMENT_META, type AssignmentStatus } from "@/lib/task-assignment";
import { History, Loader2, PlusCircle, PencilLine, Trash2, Search, UserCog, CalendarClock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/assignments/history")({
  head: () => ({
    meta: [
      { title: "ประวัติการมอบหมายงาน | Document Hub" },
      {
        name: "description",
        content: "ไทม์ไลน์การมอบหมายงาน — ใครมอบหมาย เปลี่ยนผู้รับผิดชอบ และเปลี่ยนกำหนดส่งมอบเมื่อไหร่",
      },
      { property: "og:title", content: "ประวัติการมอบหมายงาน | Document Hub" },
      {
        property: "og:description",
        content: "ไทม์ไลน์การมอบหมายงาน — ใครมอบหมาย เปลี่ยนผู้รับผิดชอบ และเปลี่ยนกำหนดส่งมอบเมื่อไหร่",
      },
    ],
  }),
  component: AssignmentHistoryPage,
});

type Change = { field: string; old: unknown; new: unknown };
type Row = {
  id: string;
  project_id: string;
  action: string;
  changes: Change[] | null;
  created_at: string;
  changed_by: string | null;
  entity_id: string | null;
  entity_label: string | null;
};

const FIELD_LABEL: Record<string, string> = {
  assignee_id: "ผู้รับผิดชอบ",
  assignee_label: "ผู้รับผิดชอบ (ข้อความ)",
  assigned_by: "ผู้มอบหมาย",
  assignment_status: "สถานะการมอบหมาย",
  end_date: "กำหนดส่งมอบ",
  start_date: "วันเริ่มงาน",
  name: "ชื่อภารกิจ",
  description: "รายละเอียดภารกิจ",
  status: "สถานะงาน",
  progress: "ความคืบหน้า (%)",
};

/** ฟิลด์ที่ถือว่าเกี่ยวข้องกับการมอบหมายงานโดยตรง */
const TRACKED = new Set([
  "assignee_id",
  "assignee_label",
  "assigned_by",
  "assignment_status",
  "end_date",
  "start_date",
]);

type FilterKey = "all" | "assignee" | "due" | "status";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "assignee", label: "เปลี่ยนผู้รับผิดชอบ" },
  { key: "due", label: "เปลี่ยนกำหนดส่งมอบ" },
  { key: "status", label: "สถานะการมอบหมาย" },
];

const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);

function AssignmentHistoryPage() {
  const guard = usePageGuard("assignments", "การมอบหมายงาน");
  const { user } = useAuth();
  const sb = getSupabase();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["assignment-history", user?.id],
    enabled: !!user && guard.allowed,
    queryFn: async () => {
      const { data: memberships } = await sb
        .from("project_members")
        .select("project_id")
        .eq("user_id", user!.id);
      const projectIds = Array.from(
        new Set((memberships ?? []).map((m) => (m as { project_id: string }).project_id)),
      );
      if (projectIds.length === 0) return { rows: [] as Row[], names: {}, projects: {} };

      const { data: rows, error: err } = await sb
        .from("project_history")
        .select("id, project_id, action, changes, created_at, changed_by, entity_id, entity_label")
        .eq("entity", "project_tasks")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false })
        .limit(400);
      if (err) throw err;

      const list = (rows ?? []) as Row[];

      // รวบรวม uuid ของผู้ใช้ทั้งหมด (ผู้แก้ไข + ค่าเก่า/ใหม่ของ assignee/assigned_by)
      const userIds = new Set<string>();
      for (const r of list) {
        if (r.changed_by) userIds.add(r.changed_by);
        for (const c of r.changes ?? []) {
          if (c.field === "assignee_id" || c.field === "assigned_by") {
            if (typeof c.old === "string") userIds.add(c.old);
            if (typeof c.new === "string") userIds.add(c.new);
          }
        }
      }
      let names: Record<string, string> = {};
      if (userIds.size) {
        const { data: profs } = await sb
          .from("profiles")
          .select("id, full_name, email")
          .in("id", Array.from(userIds));
        names = Object.fromEntries(
          (profs ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [
            p.id,
            p.full_name || p.email || "ผู้ใช้",
          ]),
        );
      }

      const { data: projs } = await sb.from("projects").select("id, name, code").in("id", projectIds);
      const projects = Object.fromEntries(
        (projs ?? []).map((p: { id: string; name: string; code: string | null }) => [
          p.id,
          p.code ? `${p.code} · ${p.name}` : p.name,
        ]),
      );

      return { rows: list, names, projects };
    },
  });

  const names = data?.names ?? {};
  const projects = data?.projects ?? {};

  const renderValue = (field: string, v: unknown): string => {
    if (v === null || v === undefined || v === "") return "—";
    if (field === "assignee_id" || field === "assigned_by")
      return typeof v === "string" ? (names[v] ?? "ผู้ใช้") : "—";
    if (field === "assignment_status")
      return ASSIGNMENT_META[v as AssignmentStatus]?.label ?? String(v);
    if (isDate(v)) return fmtDate(String(v));
    if (typeof v === "boolean") return v ? "ใช่" : "ไม่ใช่";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.rows ?? [])
      .map((r) => {
        const changes = (r.changes ?? []).filter((c) => TRACKED.has(c.field));
        return { ...r, changes };
      })
      .filter((r) => r.changes.length > 0)
      .filter((r) => {
        if (filter === "assignee")
          return r.changes.some((c) => c.field === "assignee_id" || c.field === "assignee_label");
        if (filter === "due") return r.changes.some((c) => c.field === "end_date");
        if (filter === "status") return r.changes.some((c) => c.field === "assignment_status");
        return true;
      })
      .filter((r) => {
        if (!s) return true;
        const hay = [
          r.changed_by ? (names[r.changed_by] ?? "") : "ระบบ",
          r.entity_label ?? "",
          projects[r.project_id] ?? "",
          ...r.changes.flatMap((c) => [
            FIELD_LABEL[c.field] ?? c.field,
            renderValue(c.field, c.old),
            renderValue(c.field, c.new),
          ]),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(s);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, q, filter]);

  if (!guard.allowed) return guard.node;

  return (
    <div className="space-y-6">
      <PageHeader
        title="ประวัติการมอบหมายงาน"
        description="ไทม์ไลน์ทุกการมอบหมาย — ใครมอบหมายให้ใคร เปลี่ยนผู้รับผิดชอบ และเลื่อนกำหนดส่งมอบเมื่อไหร่"
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อภารกิจ, โครงการ, ผู้มอบหมาย หรือผู้รับผิดชอบ..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                filter === f.key ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
          ยังไม่ได้ติดตั้งตารางประวัติการแก้ไข — กรุณารันไฟล์{" "}
          <code className="font-mono">db/0039_detailed_project_history.sql</code> ในฐานข้อมูลก่อน
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-muted/30 py-16 text-sm text-muted-foreground">
          <History className="h-6 w-6" />
          ยังไม่มีประวัติการมอบหมายงาน
        </div>
      ) : (
        <div className="tile p-5">
          <ol className="relative space-y-5 border-l pl-6">
            {items.map((h) => {
              const hasAssignee = h.changes.some((c) => c.field === "assignee_id");
              const hasDue = h.changes.some((c) => c.field === "end_date");
              return (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full border bg-card">
                    {h.action === "create" ? (
                      <PlusCircle className="h-3 w-3 text-success" />
                    ) : h.action === "delete" ? (
                      <Trash2 className="h-3 w-3 text-destructive" />
                    ) : hasAssignee ? (
                      <UserCog className="h-3 w-3 text-primary" />
                    ) : hasDue ? (
                      <CalendarClock className="h-3 w-3 text-warning" />
                    ) : (
                      <PencilLine className="h-3 w-3 text-primary" />
                    )}
                  </span>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {h.changed_by ? (names[h.changed_by] ?? "ผู้ใช้") : "ระบบ"}
                    </span>
                    <span>·</span>
                    <span>{fmtDateTime(h.created_at)}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {h.action === "create" ? "มอบหมายใหม่" : h.action === "delete" ? "ลบภารกิจ" : "แก้ไข"}
                    </Badge>
                  </div>

                  <div className="mt-1 text-sm font-medium">{h.entity_label || "ภารกิจ"}</div>
                  <Link
                    to="/assignments/board/$id"
                    params={{ id: h.project_id }}
                    className="text-xs text-primary hover:underline"
                  >
                    {projects[h.project_id] ?? "โครงการ"}
                  </Link>

                  <ul className="mt-2 space-y-1 text-xs">
                    {h.changes.map((c, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-1.5">
                        <span className="text-muted-foreground">{FIELD_LABEL[c.field] ?? c.field}:</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 line-through opacity-70">
                          {renderValue(c.field, c.old)}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                          {renderValue(c.field, c.new)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
