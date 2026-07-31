import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, FolderKanban, Search, Filter, LayoutGrid, Rows3, ArrowRight, ArrowUpDown, ArrowUp, ArrowDown, Eye, Users, HeartPulse } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useMyRoles, useCanSeeMoney, MONEY_MASK } from "@/hooks/use-page-access";
import { useAuth } from "@/hooks/use-supabase";
import { canCreateProjects } from "@/lib/project-roles";
import { ProjectMembersPeek } from "@/components/project/project-members-peek";
import { akaBadgeClass } from "@/lib/aka-colors";
import { getSupabase } from "@/lib/supabase";
import { fmtDate, fmtCurrency } from "@/lib/format";
import {
  LIFECYCLE_LABEL, LIFECYCLE_PHASES, STATUS_TONE,
  type ProjectLifecycleStatus,
} from "@/lib/project-lifecycle";
import { HEALTH_LABEL, HEALTH_DOT, healthFromString, type ProjectHealth } from "@/lib/project-health";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "โครงการ | Document Hub" },
      { name: "description", content: "จัดการโครงการตามวงจร Draft → RFQ → Proposal → Won/Lost → Execution → Closed" },
    ],
  }),
  component: ProjectsList,
});

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  status: string | null;
  health_status: string | null;
  customer_name: string | null;
  customer_aka: string | null;
  customer_aka_color: string | null;
  project_type: string | null;
  contract_value: number | null;
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  updated_at: string | null;
};

type PipelineSortField = "updated_at" | "end_date";
type PipelineSortDir = "asc" | "desc";

function ProjectsList() {
  const { roles } = useMyRoles();
  const canCreate = canCreateProjects(roles);
  const canPeekMembers = roles.includes("super_admin") || roles.includes("management");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [health, setHealth] = useState<"all" | ProjectHealth>("all");
  const [view, setView] = useState<"pipeline" | "list">("pipeline");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ field: "created_at" | "status"; direction: "asc" | "desc" }>({
    field: "created_at",
    direction: "desc",
  });
  const [pipelineSort, setPipelineSort] = useState<{ field: PipelineSortField; direction: PipelineSortDir }>({
    field: "updated_at",
    direction: "desc",
  });
  const pageSize = 20;

  const handleSort = (field: "created_at" | "status") => {
    setSort((prev) => {
      if (prev.field === field) {
        return { field, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { field, direction: "asc" };
    });
    setPage(0);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["projects", q, status, health, view, page, sort.field, sort.direction, pipelineSort.field, pipelineSort.direction],
    queryFn: async () => {
      const sb = getSupabase();
      let query = sb
        .from("projects")
        .select("id, code, name, status, health_status, customer_name, customer_aka, customer_aka_color, project_type, contract_value, start_date, end_date, budget, updated_at", { count: "exact" })
        .is("archived_at", null);
      if (view === "pipeline") {
        query = query.order(pipelineSort.field, { ascending: pipelineSort.direction === "asc", nullsFirst: false });
      } else if (sort.field === "status") {
        query = query.order("status", { ascending: sort.direction === "asc" }).order("created_at", { ascending: false });
      } else {
        query = query.order("created_at", { ascending: false });
      }
      if (view === "list") {
        query = query.range(page * pageSize, page * pageSize + pageSize - 1);
      } else {
        query = query.limit(300);
      }
      if (q.trim()) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%,customer_name.ilike.%${q}%,description.ilike.%${q}%`);
      if (status !== "all" && view === "list") query = query.eq("status", status);
      if (health !== "all") query = query.eq("health_status", health);
      const { data, count, error } = await query;
      if (error) throw error;
      return { data: (data ?? []) as ProjectRow[], count: count ?? 0 };
    },
  });

  const { user } = useAuth();
  const { data: myProjectIds } = useQuery({
    queryKey: ["my-project-memberships", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const sb = getSupabase();
      const { data, error } = await sb.from("project_members").select("project_id").eq("user_id", user!.id);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.project_id as string));
    },
  });
  const memberIds = myProjectIds ?? new Set<string>();




  const totalPages = Math.ceil((data?.count ?? 0) / pageSize);

  return (
    <div className="space-y-6">
      <PageHeader
        title="โครงการ"
        description="ตามลำดับ workflow · ร่าง → RFQ → ใบเสนอ Supplier → ยื่นข้อเสนอ → ผลลัพธ์ → ดำเนินงาน → ปิดโครงการ"
        actions={
          canCreate ? (
            <Button asChild size="lg" className="rounded-full shadow-sm">
              <Link to="/projects/new"><Plus className="mr-2 h-4 w-4" />เพิ่มโครงการใหม่</Link>
            </Button>
          ) : null
        }
      />

      <Card className="tile">
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="ค้นหาชื่อ / รหัส / ลูกค้า..."
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }}
              className="h-10 rounded-full border-transparent bg-muted pl-9 focus-visible:border-ring focus-visible:bg-card"
            />
          </div>
          {view === "list" && (
            <>
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
                <SelectTrigger className="w-full rounded-full md:w-56">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">สถานะทั้งหมด</SelectItem>
                  {Object.entries(LIFECYCLE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={health} onValueChange={(v) => { setHealth(v as "all" | ProjectHealth); setPage(0); }}>
                <SelectTrigger className="w-full rounded-full md:w-48">
                  <HeartPulse className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">สุขภาพทั้งหมด</SelectItem>
                  <SelectItem value="green">ตามแผน</SelectItem>
                  <SelectItem value="yellow">ใกล้เสี่ยง</SelectItem>
                  <SelectItem value="red">ล่าช้า</SelectItem>
                  <SelectItem value="grey">ปิดโครงการ</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
          {view === "pipeline" && (
            <Select
              value={`${pipelineSort.field}:${pipelineSort.direction}`}
              onValueChange={(v) => {
                const [field, direction] = v.split(":") as [PipelineSortField, PipelineSortDir];
                setPipelineSort({ field, direction });
              }}
            >
              <SelectTrigger className="w-full rounded-full md:w-60">
                <ArrowUpDown className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated_at:desc">อัปเดตล่าสุดก่อน</SelectItem>
                <SelectItem value="updated_at:asc">อัปเดตเก่าสุดก่อน</SelectItem>
                <SelectItem value="end_date:asc">ครบกำหนดใกล้สุดก่อน</SelectItem>
                <SelectItem value="end_date:desc">ครบกำหนดไกลสุดก่อน</SelectItem>
              </SelectContent>
            </Select>
          )}
          <div className="inline-flex rounded-full border bg-muted p-1">
            <button
              onClick={() => setView("pipeline")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                view === "pipeline" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />Pipeline
            </button>
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                view === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              <Rows3 className="h-3.5 w-3.5" />List
            </button>
          </div>
        </CardContent>
      </Card>

      {view === "pipeline" ? (
        <PipelineView rows={data?.data ?? []} isLoading={isLoading} memberIds={memberIds} canPeekMembers={canPeekMembers} />
      ) : (
        <ListView
          rows={data?.data ?? []}
          isLoading={isLoading}
          page={page}
          totalPages={totalPages}
          count={data?.count ?? 0}
          pageSize={pageSize}
          onPage={setPage}
          sort={sort}
          onSort={handleSort}
        />
      )}
    </div>
  );
}

// ชนะงาน/แพ้งาน ไม่แสดงเป็นคอลัมน์ใน pipeline — ดูสถิติได้ที่หน้ารายงาน
const PIPELINE_COLUMNS: { key: ProjectLifecycleStatus; label: string; short: string }[] = [
  ...LIFECYCLE_PHASES.slice(0, 4).map((p) => ({ key: p.key, label: p.label, short: p.short })),
  { key: "in_progress", label: "ดำเนินโครงการ", short: "Execution" },
  { key: "completed", label: "ปิดโครงการ", short: "Closed" },
];

function PipelineView({ rows, isLoading, memberIds, canPeekMembers }: { rows: ProjectRow[]; isLoading: boolean; memberIds: Set<string>; canPeekMembers: boolean }) {
  const { canSeeMoney } = useCanSeeMoney();
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-56 animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="ยังไม่มีโครงการ"
        description="เริ่มต้นเพิ่มโครงการแรกเพื่อจัดกลุ่มเอกสารและติดตามความคืบหน้า"
      />
    );
  }

  const grouped = new Map<string, ProjectRow[]>();
  PIPELINE_COLUMNS.forEach((c) => grouped.set(c.key, []));
  let lostCount = 0;
  rows.forEach((r) => {
    let k = (r.status ?? "draft") as ProjectLifecycleStatus;
    if (k === "lost") { lostCount += 1; return; }        // ดูสถิติที่หน้ารายงาน
    if (k === "won") k = "in_progress";                   // ชนะงาน = เข้าสู่การดำเนินโครงการ
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(r);
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {PIPELINE_COLUMNS.map((col) => {
        const items = grouped.get(col.key) ?? [];
        const st = col.key;
        const c = phaseTone(st);
        return (
          <div key={col.key} className={`tile flex flex-col overflow-hidden p-0 ${c.column}`}>
            <div className={`mb-0 flex items-center justify-between border-b px-3 py-2.5 ${c.header}`}>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                <span className={`text-xs font-semibold tracking-wide ${c.text}`}>{col.label}</span>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.badge}`}>{items.length}</span>
            </div>
            <div className="min-h-[6rem] space-y-2 p-3">
              {items.length === 0 ? (
                <div className={`grid h-24 place-items-center rounded-md border border-dashed text-[11px] text-muted-foreground ${c.empty}`}>
                  ว่าง
                </div>
              ) : (
                items.map((p) => (
                  <Link
                    key={p.id}
                    to="/projects/$id"
                    params={{ id: p.id }}
                    className={`tile tile-interactive block rounded-lg border-l-4 p-3 ${c.card}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {p.customer_aka && (
                          <span className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide shadow-sm ${akaBadgeClass(p.customer_aka_color)}`}>
                            {p.customer_aka}
                          </span>
                        )}
                        <div className="truncate font-mono text-[10px] uppercase text-muted-foreground">{p.code}</div>
                      </div>
                      {canSeeMoney && p.contract_value != null && (
                        <div className={`shrink-0 text-[10px] font-semibold tabular-nums ${c.text}`}>
                          {fmtCurrency(p.contract_value, "THB")}
                        </div>
                      )}
                    </div>
                    <div className="mt-1 line-clamp-2 text-sm font-medium leading-snug">{p.name}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {memberIds.has(p.id) ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          <Users className="h-3 w-3" />สมาชิกโครงการ
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          <Eye className="h-3 w-3" />โหมดดูอย่างเดียว
                        </span>
                      )}
                      {canPeekMembers && <ProjectMembersPeek projectId={p.id} projectName={p.name} />}
                    </div>
                    <div className="mt-2 truncate text-xs text-muted-foreground">{p.customer_name ?? "—"}</div>
                    {p.end_date && (
                      <div className="mt-1.5 text-[10px] text-muted-foreground">ครบ {fmtDate(p.end_date)}</div>
                    )}
                  </Link>
                ))
              )}
            </div>
          </div>
        );
      })}

      </div>
      {lostCount > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-dashed px-4 py-3 text-xs text-muted-foreground">
          <span>มีโครงการที่แพ้งาน {lostCount} รายการ (ไม่แสดงใน pipeline)</span>
          <Link to="/reports" className="font-medium text-primary hover:underline">ดูสถิติแพ้/ชนะในรายงาน →</Link>
        </div>
      )}
    </div>
  );
}

type PhaseTone = {
  column: string; header: string; dot: string; text: string; badge: string; card: string; empty: string;
};

const PHASE_TONES: Record<string, PhaseTone> = {
  draft: {
    column: "border-phase-draft/25",
    header: "border-phase-draft/20 bg-phase-draft/8",
    dot: "bg-phase-draft", text: "text-phase-draft",
    badge: "bg-phase-draft/15 text-phase-draft",
    card: "border-l-phase-draft/70 hover:bg-phase-draft/5",
    empty: "border-phase-draft/25",
  },
  rfq_sent: {
    column: "border-phase-rfq/25",
    header: "border-phase-rfq/20 bg-phase-rfq/8",
    dot: "bg-phase-rfq", text: "text-phase-rfq",
    badge: "bg-phase-rfq/15 text-phase-rfq",
    card: "border-l-phase-rfq/70 hover:bg-phase-rfq/5",
    empty: "border-phase-rfq/25",
  },
  quotation_received: {
    column: "border-phase-supplier/25",
    header: "border-phase-supplier/20 bg-phase-supplier/8",
    dot: "bg-phase-supplier", text: "text-phase-supplier",
    badge: "bg-phase-supplier/15 text-phase-supplier",
    card: "border-l-phase-supplier/70 hover:bg-phase-supplier/5",
    empty: "border-phase-supplier/25",
  },
  proposal_submitted: {
    column: "border-phase-proposal/30",
    header: "border-phase-proposal/25 bg-phase-proposal/10",
    dot: "bg-phase-proposal", text: "text-phase-proposal",
    badge: "bg-phase-proposal/20 text-phase-proposal",
    card: "border-l-phase-proposal/70 hover:bg-phase-proposal/5",
    empty: "border-phase-proposal/30",
  },
  in_progress: {
    column: "border-phase-progress/25",
    header: "border-phase-progress/20 bg-phase-progress/8",
    dot: "bg-phase-progress", text: "text-phase-progress",
    badge: "bg-phase-progress/15 text-phase-progress",
    card: "border-l-phase-progress/70 hover:bg-phase-progress/5",
    empty: "border-phase-progress/25",
  },
  completed: {
    column: "border-phase-done/25",
    header: "border-phase-done/20 bg-phase-done/8",
    dot: "bg-phase-done", text: "text-phase-done",
    badge: "bg-phase-done/15 text-phase-done",
    card: "border-l-phase-done/70 hover:bg-phase-done/5",
    empty: "border-phase-done/25",
  },
};

function phaseTone(st: ProjectLifecycleStatus): PhaseTone {
  const key = st === "won" ? "in_progress" : st;
  return PHASE_TONES[key] ?? PHASE_TONES.draft;
}


function ListView({
  rows, isLoading, page, totalPages, count, pageSize, onPage, sort, onSort,
}: {
  rows: ProjectRow[];
  isLoading: boolean;
  page: number;
  totalPages: number;
  count: number;
  pageSize: number;
  onPage: (p: number | ((prev: number) => number)) => void;
  sort: { field: "created_at" | "status"; direction: "asc" | "desc" };
  onSort: (field: "created_at" | "status") => void;
}) {
  const { canSeeMoney } = useCanSeeMoney();
  const SortIcon = sort.field === "status"
    ? (sort.direction === "asc" ? ArrowUp : ArrowDown)
    : ArrowUpDown;

  return (
    <Card className="tile">
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-muted/60" />)}
          </div>
        ) : rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">รหัส</th>
                  <th className="px-4 py-3">ชื่อโครงการ</th>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3">
                    <button
                      onClick={() => onSort("status")}
                      className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                    >
                      สถานะ <SortIcon className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3">เริ่ม</th>
                  <th className="px-4 py-3">สิ้นสุด</th>
                  <th className="px-4 py-3 text-right">มูลค่าสัญญา</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const st = (p.status ?? "draft") as ProjectLifecycleStatus;
                  return (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link to="/projects/$id" params={{ id: p.id }} className="text-primary hover:underline">{p.code}</Link>
                      </td>
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.customer_aka && (
                          <span className={`mr-1.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${akaBadgeClass(p.customer_aka_color)}`}>{p.customer_aka}</span>
                        )}
                        {p.customer_name ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={STATUS_TONE[st]}>{LIFECYCLE_LABEL[st] ?? st}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(p.start_date)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(p.end_date)}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{canSeeMoney ? fmtCurrency(p.contract_value ?? p.budget, "THB") : MONEY_MASK}</td>
                      <td className="px-4 py-3 text-right">
                        <Link to="/projects/$id" params={{ id: p.id }} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          เปิด <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={FolderKanban}
            title="ยังไม่มีโครงการ"
            description="เริ่มต้นเพิ่มโครงการแรกเพื่อจัดกลุ่มเอกสารและติดตามความคืบหน้า"
              />
        )}
        {count > pageSize && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <div className="text-muted-foreground">แสดง {page * pageSize + 1}–{Math.min((page + 1) * pageSize, count)} จาก {count} รายการ</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onPage((p) => p - 1)}>ก่อนหน้า</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => onPage((p) => p + 1)}>ถัดไป</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
