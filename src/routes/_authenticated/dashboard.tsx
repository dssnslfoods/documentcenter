import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  FileText, FileSignature, AlertTriangle, Clock, CheckCircle2, DollarSign,
  Plus, ArrowRight, HeartPulse,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useCanSeeMoney, useMyRoles, useCanAccess } from "@/hooks/use-page-access";
import { ROLES } from "@/lib/pages";
import { canCreateProjects } from "@/lib/project-roles";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-supabase";
import { fmtCurrency, fmtDate, fmtNumber, toLocalISODate, addLocalDays } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { fetchProjectFinancials } from "@/lib/project-financials";
import { LIFECYCLE_LABEL, STATUS_TONE, type ProjectLifecycleStatus } from "@/lib/project-lifecycle";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { HEALTH_LABEL, HEALTH_DOT, healthFromString, type ProjectHealth } from "@/lib/project-health";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "ภาพรวม | Document Hub" },
      { name: "description", content: "Executive Dashboard สำหรับผู้บริหาร ดู KPI สัญญาใกล้หมดอายุ และงานเร่งด่วน" },
    ],
  }),
  component: Dashboard,
});

const CHART_COLORS = [
  "var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)",
  "var(--color-chart-4)", "var(--color-chart-5)",
];

function HealthBadge({ health, size = "sm" }: { health: ProjectHealth; size?: "sm" | "xs" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${
        size === "xs" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-[11px]"
      } ${health === "green" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : health === "yellow" ? "bg-amber-50 text-amber-700 border-amber-200" : health === "red" ? "bg-red-50 text-red-700 border-red-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${HEALTH_DOT[health]}`} />
      {HEALTH_LABEL[health]}
    </span>
  );
}

function Dashboard() {
  const { roles } = useMyRoles();
  const canCreate = canCreateProjects(roles);
  const isExec = canCreate;
  const { can } = useCanAccess();
  const { canSeeMoney } = useCanSeeMoney();
  const { user } = useAuth();
  const roleLabel = roles.map((r) => ROLES.find((x) => x.value === r)?.label ?? r).join(" · ");

  const { data: profile } = useQuery({
    queryKey: ["dashboard-profile", user?.id],
    queryFn: async () => {
      const { data } = await getSupabase().from("profiles").select("full_name").eq("id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });
  const displayName =
    profile?.full_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "ผู้ใช้งาน";

  /** โครงการที่ผู้ใช้เกี่ยวข้อง — ใช้จำกัดขอบเขตข้อมูลของผู้ที่ไม่ใช่ผู้บริหาร */
  const { data: myProjectIds } = useQuery({
    queryKey: ["my-project-ids", user?.id],
    queryFn: async () => {
      const sb = getSupabase();
      const [{ data: memberships }, { data: owned }] = await Promise.all([
        sb.from("project_members").select("project_id").eq("user_id", user!.id),
        sb.from("projects").select("id").eq("owner_id", user!.id),
      ]);
      const ids = new Set<string>((memberships ?? []).map((m: any) => m.project_id));
      (owned ?? []).forEach((p: any) => ids.add(p.id));
      return Array.from(ids);
    },
    enabled: !!user,
  });
  const scopedIds = myProjectIds ?? [];
  const scopeReady = isExec || !!myProjectIds;

  const { data: myProjects } = useQuery({
    queryKey: ["my-projects", user?.id],
    queryFn: async () => {
      const sb = getSupabase();
      const empty = { in_progress: [] as any[], completed: [] as any[] };
      if (!user) return empty;
      const { data: memberships } = await sb
        .from("project_members")
        .select("project_id")
        .eq("user_id", user.id);
      const ids = Array.from(new Set((memberships ?? []).map((m: any) => m.project_id)));
      // include projects the user owns even if membership row is missing
      const { data: owned } = await sb.from("projects").select("id").eq("owner_id", user.id);
      (owned ?? []).forEach((p: any) => { if (!ids.includes(p.id)) ids.push(p.id); });
      if (ids.length === 0) return empty;
      const { data } = await sb
        .from("projects")
        .select("id, code, name, status, health_status, updated_at, customer_name")
        .in("id", ids)
        .in("status", ["in_progress", "completed"])
        .is("archived_at", null)
        .order("updated_at", { ascending: false });
      return {
        in_progress: (data ?? []).filter((p: any) => p.status === "in_progress"),
        completed: (data ?? []).filter((p: any) => p.status === "completed"),
      };
    },
    enabled: !!user,
  });


  // KPI จากข้อมูลโครงการ (ตาราง documents / contracts / quotations เดิมไม่มีการใช้งานแล้ว)
  const { data: kpi, isLoading } = useQuery({
    queryKey: ["dashboard-kpi", isExec],
    enabled: can("documents") || can("projects") || can("quotations"),
    queryFn: async () => {
      const sb = getSupabase();
      const today = toLocalISODate();
      const in30 = toLocalISODate(addLocalDays(new Date(), 30));

      const [active, proposals, docs] = await Promise.all([
        sb.from("projects").select("id, end_date").in("status", ["won", "in_progress"]).is("archived_at", null),
        sb.from("projects").select("id", { count: "exact", head: true }).eq("status", "proposal_submitted").is("archived_at", null),
        sb.from("project_documents").select("id, projects(status)"),
      ]);
      if (active.error) throw active.error;
      if (proposals.error) throw proposals.error;
      if (docs.error) throw docs.error;

      const activeRows = (active.data ?? []) as { id: string; end_date: string | null }[];
      const financials = canSeeMoney ? await fetchProjectFinancials(activeRows.map((r) => r.id)) : new Map();
      const totalValue = Array.from(financials.values()).reduce((s, f) => s + (f.contract_value ?? 0), 0);
      const docRows = (docs.data ?? []) as { projects: { status: string } | { status: string }[] | null }[];
      const openDocs = docRows.filter((d) => {
        const proj = Array.isArray(d.projects) ? d.projects[0] : d.projects;
        return proj && !["completed", "lost"].includes(proj.status);
      }).length;

      return {
        totalDocs: docRows.length,
        activeDocs: openDocs,
        expiring30: activeRows.filter((r) => r.end_date && r.end_date >= today && r.end_date <= in30).length,
        expired: activeRows.filter((r) => r.end_date && r.end_date < today).length,
        quotPending: proposals.count ?? 0,
        totalContractValue: totalValue,
      };
    },
  });

  const DOC_TYPE_LABEL: Record<string, string> = {
    rfq_spec: "RFQ / Spec", tor: "TOR", contract: "สัญญา / ใบสั่งจ้าง", final_quotation: "ใบเสนอราคา Final", other: "อื่นๆ",
  };

  const { data: docsByType } = useQuery({
    queryKey: ["docs-by-type"],
    enabled: can("documents"),
    queryFn: async () => {
      const { data, error } = await getSupabase().from("project_documents").select("document_type");
      if (error) throw error;
      const map = new Map<string, number>();
      (data ?? []).forEach((r: { document_type: string | null }) => {
        const name = DOC_TYPE_LABEL[r.document_type ?? "other"] ?? "อื่นๆ";
        map.set(name, (map.get(name) ?? 0) + 1);
      });
      return Array.from(map, ([name, count]) => ({ name, count }));
    },
  });

  const { data: upcomingContracts } = useQuery({
    queryKey: ["upcoming-project-deadlines", canSeeMoney],
    enabled: can("projects"),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("projects")
        .select("id, code, name, customer_name, end_date, status")
        .in("status", ["won", "in_progress"])
        .is("archived_at", null)
        .gte("end_date", toLocalISODate())
        .lte("end_date", toLocalISODate(addLocalDays(new Date(), 90)))
        .order("end_date", { ascending: true })
        .limit(10);
      if (error) throw error;
      const rows = (data ?? []) as { id: string; code: string; name: string; customer_name: string | null; end_date: string; status: ProjectLifecycleStatus }[];
      const financials = canSeeMoney ? await fetchProjectFinancials(rows.map((r) => r.id)) : new Map();
      return rows.map((r) => ({ ...r, contract_value: financials.get(r.id)?.contract_value ?? null }));
    },
  });

  const { data: healthSummary } = useQuery({
    queryKey: ["project-health-summary", isExec, scopedIds.join(",")],
    enabled: scopeReady,
    queryFn: async () => {
      let q = getSupabase()
        .from("projects")
        .select("id, code, name, status, health_status, health_reason, end_date, customer_name")
        .is("archived_at", null)
        .neq("status", "lost")
        .in("health_status", ["red", "yellow"]);
      if (!isExec) {
        if (scopedIds.length === 0) return { red: [] as any[], yellow: [] as any[] };
        q = q.in("id", scopedIds);
      }
      const { data, error } = await q.order("health_status", { ascending: false }).order("end_date", { ascending: true }).limit(50);
      if (error) throw error;
      const rows = data ?? [];
      return {
        red: rows.filter((r: any) => r.health_status === "red"),
        yellow: rows.filter((r: any) => r.health_status === "yellow"),
      };
    },
  });

  const { data: pipeline } = useQuery({
    queryKey: ["project-pipeline", isExec, scopedIds.join(",")],
    enabled: scopeReady,
    queryFn: async () => {
      let q = getSupabase().from("projects").select("status").is("archived_at", null);
      if (!isExec) {
        if (scopedIds.length === 0) return [];
        q = q.in("id", scopedIds);
      }
      const { data } = await q;
      const labels: Record<string, string> = {
        draft: "ร่าง", rfq_sent: "RFQ", quotation_received: "Supplier",
        proposal_submitted: "Proposal", won: "ชนะ", lost: "แพ้",
        in_progress: "ดำเนินการ", completed: "ปิด",
      };
      const map = new Map<string, number>();
      (data ?? []).forEach((r: { status: string | null }) => {
        const k = labels[r.status ?? "draft"] ?? "อื่นๆ";
        map.set(k, (map.get(k) ?? 0) + 1);
      });
      return Array.from(map, ([name, count]) => ({ name, count }));
    },
  });

  const { data: upcomingMilestones } = useQuery({
    queryKey: ["upcoming-milestones", isExec, scopedIds.join(",")],
    enabled: scopeReady,
    queryFn: async () => {
      const today = toLocalISODate();
      const in30 = toLocalISODate(addLocalDays(new Date(), 30));
      let q = getSupabase()
        .from("project_milestones")
        .select("id, description, due_date, status, project_id, projects(code, name)")
        .eq("status", "pending")
        .gte("due_date", today)
        .lte("due_date", in30);
      if (!isExec) {
        if (scopedIds.length === 0) return [];
        q = q.in("project_id", scopedIds);
      }
      const { data } = await q.order("due_date", { ascending: true }).limit(6);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title={`สวัสดี, ${displayName}`}
        description={
          roleLabel
            ? `${roleLabel} · ${isExec ? "ภาพรวมทั้งองค์กร" : "แสดงเฉพาะโครงการที่คุณมีส่วนร่วม"}`
            : isExec ? "ภาพรวมทั้งองค์กร" : "แสดงเฉพาะโครงการที่คุณมีส่วนร่วม"
        }
        actions={
          canCreate ? (
            <Button asChild size="lg" className="rounded-full shadow-sm">
              <Link to="/projects/new"><Plus className="mr-2 h-4 w-4" />เพิ่มโครงการ</Link>
            </Button>
          ) : null
        }
      />

      {/* Bento — What's next hero + KPI stack */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Hero: งานที่ต้องทำก่อน */}
        <div className="tile relative overflow-hidden bg-gradient-to-br from-primary to-primary/70 p-4 text-primary-foreground sm:p-6 lg:col-span-2 lg:row-span-2">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <div className="text-xs font-semibold uppercase tracking-widest opacity-80">งานที่ต้องทำก่อน</div>
            <div className="mt-1 font-display text-lg font-semibold tracking-tight sm:text-2xl">
              งวดงานครบกำหนดใน 30 วัน{isExec ? "" : " (โครงการของคุณ)"}
            </div>
            <div className="mt-4 space-y-2">
              {upcomingMilestones && upcomingMilestones.length > 0 ? (
                upcomingMilestones.map((m: any) => {
                  const proj = Array.isArray(m.projects) ? m.projects[0] : m.projects;
                  return (
                    <Link
                      key={m.id}
                      to="/projects/$id"
                      params={{ id: m.project_id }}
                      className="group flex items-center justify-between gap-3 rounded-lg bg-white/10 px-3 py-2.5 text-sm backdrop-blur transition-colors hover:bg-white/20"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{m.description}</div>
                        <div className="truncate text-xs opacity-80">{proj?.code} · {proj?.name}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-xs opacity-90">
                        <span className="tabular-nums">{fmtDate(m.due_date)}</span>
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </Link>
                  );
                })
              ) : (
                <div className="rounded-lg bg-white/10 px-4 py-6 text-sm opacity-90">
                  ไม่มีงวดงานเร่งด่วน — เยี่ยมมาก 🎉
                </div>
              )}
            </div>
            <Link to="/calendar" className="mt-4 inline-flex items-center gap-1 text-xs font-medium opacity-90 hover:opacity-100">
              ดูปฏิทินทั้งหมด <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {can("projects") && (
          <>
            <KpiCard icon={Clock} label="โครงการใกล้ครบกำหนด (30 วัน)" value={fmtNumber(kpi?.expiring30)} loading={isLoading} tone="warning" href="/projects" />
            <KpiCard icon={AlertTriangle} label="โครงการเลยกำหนดส่งมอบ" value={fmtNumber(kpi?.expired)} loading={isLoading} tone="destructive" href="/projects" />
          </>
        )}
        {can("projects") && (
          <KpiCard icon={FileSignature} label="รอผลการเสนอราคา" value={fmtNumber(kpi?.quotPending)} loading={isLoading} href="/projects" />
        )}
        {scopeReady && (
          <>
            <KpiCard icon={HeartPulse} label="โครงการล่าช้า" value={fmtNumber(healthSummary?.red.length)} loading={!healthSummary} tone="destructive" href="/projects" />
            <KpiCard icon={HeartPulse} label="โครงการใกล้เสี่ยง" value={fmtNumber(healthSummary?.yellow.length)} loading={!healthSummary} tone="warning" href="/projects" />
          </>
        )}
      </div>

      {/* Secondary KPI row */}
      {(can("documents") || can("projects")) && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {can("documents") && (
            <>
              <KpiCard icon={FileText} label="เอกสารทั้งหมด" value={fmtNumber(kpi?.totalDocs)} loading={isLoading} href="/documents" />
              <KpiCard icon={CheckCircle2} label="เอกสารของโครงการที่ยังเปิดอยู่" value={fmtNumber(kpi?.activeDocs)} loading={isLoading} tone="success" href="/documents" />
            </>
          )}
          {can("projects") && canSeeMoney && (
            <KpiCard icon={DollarSign} label="มูลค่าสัญญาโครงการที่ดำเนินการ (ก่อน VAT)" value={fmtCurrency(kpi?.totalContractValue)} loading={isLoading} tone="accent" href="/projects" />
          )}
        </div>
      )}

      {/* โครงการที่ฉันมีส่วนร่วม */}
      <Card className="tile">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">โครงการที่ฉันมีส่วนร่วม</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">เฉพาะโครงการที่ดำเนินการอยู่และเสร็จสิ้นแล้ว</p>
          </div>
          <Link to="/projects" className="text-xs text-primary hover:underline">ดูโครงการทั้งหมด →</Link>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <MyProjectGroup title="ดำเนินโครงการ" tone="primary" items={myProjects?.in_progress ?? []} />
          <MyProjectGroup title="เสร็จสิ้นแล้ว" tone="success" items={myProjects?.completed ?? []} />
        </CardContent>
      </Card>

      {/* Project health / at-risk */}
      {scopeReady && (healthSummary?.red.length || healthSummary?.yellow.length) ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="tile lg:col-span-3">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">โครงการที่ต้องติดตาม</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  โครงการที่ล่าช้า (แดง) และใกล้เสี่ยง (เหลือง){isExec ? "" : " · เฉพาะโครงการของคุณ"}
                </p>
              </div>
              <Link to="/projects" className="text-xs text-primary hover:underline">ดูทั้งหมด →</Link>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-700">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  ล่าช้า ({healthSummary?.red.length ?? 0})
                </div>
                <AtRiskProjectList items={healthSummary?.red ?? []} tone="destructive" />
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-700">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  ใกล้เสี่ยง ({healthSummary?.yellow.length ?? 0})
                </div>
                <AtRiskProjectList items={healthSummary?.yellow ?? []} tone="warning" />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className={`tile ${can("documents") ? "lg:col-span-2" : "lg:col-span-3"}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Pipeline โครงการ</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">แยกตามระยะของ workflow{isExec ? "" : " · เฉพาะโครงการของคุณ"}</p>
            </div>
            <Link to="/projects" className="text-xs text-primary hover:underline">เปิด pipeline →</Link>
          </CardHeader>
          <CardContent>
            {pipeline && pipeline.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={pipeline}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="name" fontSize={11} stroke="var(--color-muted-foreground)" />
                  <YAxis fontSize={11} allowDecimals={false} stroke="var(--color-muted-foreground)" />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)" }} />
                  <Bar dataKey="count" fill="var(--color-primary)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-12 text-center text-sm text-muted-foreground">ยังไม่มีโครงการ</div>
            )}
          </CardContent>
        </Card>

        {can("documents") && (
        <Card className="tile">
          <CardHeader>
            <CardTitle className="text-base">สัดส่วนเอกสารโครงการ</CardTitle>
          </CardHeader>
          <CardContent>
            {docsByType && docsByType.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={docsByType} dataKey="count" nameKey="name" innerRadius={45} outerRadius={90} paddingAngle={2}>
                    {docsByType.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-12 text-center text-sm text-muted-foreground">ยังไม่มีข้อมูล</div>
            )}
          </CardContent>
        </Card>
        )}
      </div>

      {can("projects") && (
      <Card className="tile">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">โครงการที่จะครบกำหนดใน 90 วัน</CardTitle>
          <Link to="/projects" className="text-xs text-primary hover:underline">ดูโครงการทั้งหมด →</Link>
        </CardHeader>
        <CardContent>
          {upcomingContracts && upcomingContracts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">รหัส</th>
                    <th className="px-3 py-2">โครงการ</th>
                    <th className="px-3 py-2">ลูกค้า</th>
                    <th className="px-3 py-2">ครบกำหนด</th>
                    {canSeeMoney && <th className="px-3 py-2 text-right">มูลค่าสัญญา</th>}
                    <th className="px-3 py-2">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingContracts.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-3 py-2 font-mono text-xs">{c.code}</td>
                      <td className="px-3 py-2 font-medium">
                        <Link to="/projects/$id" params={{ id: c.id }} className="hover:underline">{c.name}</Link>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{c.customer_name ?? "-"}</td>
                      <td className="px-3 py-2">{fmtDate(c.end_date)}</td>
                      {canSeeMoney && <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtCurrency(c.contract_value)}</td>}
                      <td className="px-3 py-2"><Badge variant="outline" className={STATUS_TONE[c.status]}>{LIFECYCLE_LABEL[c.status]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">ไม่มีโครงการที่จะครบกำหนดใน 90 วัน</p>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, loading, tone = "default", href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
  loading: boolean;
  tone?: "default" | "success" | "warning" | "destructive" | "accent";
  href?: string;
}) {
  const toneClass = {
    default: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/25 text-warning-foreground",
    destructive: "bg-destructive/15 text-destructive",
    accent: "bg-accent/10 text-accent",
  }[tone];
  const inner = (
    <div className="flex items-center gap-3 p-5">
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${toneClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-muted-foreground">{label}</div>
        <div className="mt-0.5 truncate font-display text-xl font-semibold tabular-nums">
          {loading ? <span className="inline-block h-5 w-16 animate-pulse rounded bg-muted" /> : value}
        </div>
      </div>
      {href && <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </div>
  );
  if (href) {
    return <Link to={href} className="tile tile-interactive block">{inner}</Link>;
  }
  return <div className="tile">{inner}</div>;
}

function MyProjectGroup({ title, tone, items }: { title: string; tone: "primary" | "success"; items: any[] }) {
  const dot = tone === "success" ? "bg-success" : "bg-primary";
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {title}
        <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
          ยังไม่มีโครงการในกลุ่มนี้
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map((p) => (
            <Link
              key={p.id}
              to="/projects/$id"
              params={{ id: p.id }}
              className="group flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{p.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {p.code}{p.customer_name ? ` · ${p.customer_name}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <HealthBadge health={healthFromString(p.health_status)} size="xs" />
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function AtRiskProjectList({ items, tone }: { items: any[]; tone: "warning" | "destructive" }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {items.slice(0, 5).map((p) => (
        <Link
          key={p.id}
          to="/projects/$id"
          params={{ id: p.id }}
          className="group flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{p.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {p.code}{p.customer_name ? ` · ${p.customer_name}` : ""}
              {p.health_reason ? ` · ${p.health_reason}` : ""}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <HealthBadge health={healthFromString(p.health_status)} size="xs" />
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>
      ))}
    </div>
  );
}
