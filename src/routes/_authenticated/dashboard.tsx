import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  FileText, FileSignature, AlertTriangle, Clock, CheckCircle2, DollarSign,
  Plus, ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-supabase";
import { fmtCurrency, fmtDate, fmtNumber } from "@/lib/format";
import { ContractStatusBadge } from "@/components/status-badge";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
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

function Dashboard() {
  const { user } = useAuth();

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
        .select("id, code, name, status, updated_at, customer_name")
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


  const { data: kpi, isLoading } = useQuery({
    queryKey: ["dashboard-kpi"],
    queryFn: async () => {
      const sb = getSupabase();
      const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);

      const [docs, activeDocs, expiring, expired, quotPending, valSum] = await Promise.all([
        sb.from("documents").select("id", { count: "exact", head: true }),
        sb.from("documents").select("id", { count: "exact", head: true }).eq("status", "active"),
        sb.from("contracts").select("id", { count: "exact", head: true }).eq("status", "active").lte("end_date", in30).gte("end_date", today),
        sb.from("contracts").select("id", { count: "exact", head: true }).lt("end_date", today).neq("status", "archived"),
        sb.from("quotations").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review", "negotiation"]),
        sb.from("contracts").select("value_amount").eq("status", "active"),
      ]);

      const totalValue = (valSum.data ?? []).reduce((s: number, r: { value_amount: number | null }) => s + (r.value_amount ?? 0), 0);

      return {
        totalDocs: docs.count ?? 0,
        activeDocs: activeDocs.count ?? 0,
        expiring30: expiring.count ?? 0,
        expired: expired.count ?? 0,
        quotPending: quotPending.count ?? 0,
        totalContractValue: totalValue,
      };
    },
  });

  const { data: docsByType } = useQuery({
    queryKey: ["docs-by-type"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("documents")
        .select("category_id, document_categories(name_th)")
        .neq("status", "archived");
      const map = new Map<string, number>();
      (data ?? []).forEach((r: any) => {
        const cat = Array.isArray(r.document_categories) ? r.document_categories[0] : r.document_categories;
        const name = cat?.name_th ?? "อื่นๆ";
        map.set(name, (map.get(name) ?? 0) + 1);
      });
      return Array.from(map, ([name, count]) => ({ name, count })).slice(0, 8);
    },
  });

  const { data: upcomingContracts } = useQuery({
    queryKey: ["upcoming-contracts"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const in90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
      const { data } = await getSupabase()
        .from("contracts")
        .select("id, contract_no, title, end_date, value_amount, status, partners(name)")
        .gte("end_date", today)
        .lte("end_date", in90)
        .order("end_date", { ascending: true })
        .limit(10);
      return data ?? [];
    },
  });

  const { data: pipeline } = useQuery({
    queryKey: ["project-pipeline"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("projects")
        .select("status")
        .is("archived_at", null);
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
    queryKey: ["upcoming-milestones"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const { data } = await getSupabase()
        .from("project_milestones")
        .select("id, description, due_date, status, project_id, projects(code, name)")
        .eq("status", "pending")
        .gte("due_date", today)
        .lte("due_date", in30)
        .order("due_date", { ascending: true })
        .limit(6);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="ภาพรวม"
        description="เริ่มต้นวันด้วยงานที่ต้องทำ · ตามด้วยสถานะโครงการและสัญญา"
        actions={
          <Button asChild size="lg" className="rounded-full shadow-sm">
            <Link to="/projects/new"><Plus className="mr-2 h-4 w-4" />เพิ่มโครงการ</Link>
          </Button>
        }
      />

      {/* Bento — What's next hero + KPI stack */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Hero: งานที่ต้องทำก่อน */}
        <div className="tile relative overflow-hidden bg-gradient-to-br from-primary to-primary/70 p-6 text-primary-foreground lg:col-span-2 lg:row-span-2">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <div className="text-xs font-semibold uppercase tracking-widest opacity-80">งานที่ต้องทำก่อน</div>
            <div className="mt-1 font-display text-2xl font-semibold tracking-tight">งวดงานครบกำหนดใน 30 วัน</div>
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

        <KpiCard icon={Clock} label="สัญญาใกล้หมดอายุ (30 วัน)" value={fmtNumber(kpi?.expiring30)} loading={isLoading} tone="warning" href="/contracts" />
        <KpiCard icon={AlertTriangle} label="สัญญาหมดอายุแล้ว" value={fmtNumber(kpi?.expired)} loading={isLoading} tone="destructive" href="/contracts" />
        <KpiCard icon={FileSignature} label="ใบเสนอราคารอพิจารณา" value={fmtNumber(kpi?.quotPending)} loading={isLoading} href="/quotations" />
        <KpiCard icon={CheckCircle2} label="งานรออนุมัติ" value="—" loading={false} href="/approvals" />
      </div>

      {/* Secondary KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={FileText} label="เอกสารทั้งหมด" value={fmtNumber(kpi?.totalDocs)} loading={isLoading} href="/documents" />
        <KpiCard icon={CheckCircle2} label="เอกสารกำลังใช้งาน" value={fmtNumber(kpi?.activeDocs)} loading={isLoading} tone="success" href="/documents" />
        <KpiCard icon={DollarSign} label="มูลค่าสัญญาที่ใช้งาน" value={fmtCurrency(kpi?.totalContractValue)} loading={isLoading} tone="accent" href="/contracts" />
        <KpiCard icon={CheckCircle2} label="งานรออนุมัติ" value="—" loading={false} href="/approvals" />
      </div>

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


      {/* Analytics */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="tile lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Pipeline โครงการ</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">แยกตามระยะของ workflow</p>
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

        <Card className="tile">
          <CardHeader>
            <CardTitle className="text-base">สัดส่วนหมวดเอกสาร</CardTitle>
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
      </div>

      <Card className="tile">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">สัญญาที่จะครบกำหนดใน 90 วัน</CardTitle>
          <Link to="/contracts" className="text-xs text-primary hover:underline">ดูสัญญาทั้งหมด →</Link>
        </CardHeader>
        <CardContent>
          {upcomingContracts && upcomingContracts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">เลขที่</th>
                    <th className="px-3 py-2">ชื่อสัญญา</th>
                    <th className="px-3 py-2">คู่สัญญา</th>
                    <th className="px-3 py-2">วันหมดอายุ</th>
                    <th className="px-3 py-2 text-right">มูลค่า</th>
                    <th className="px-3 py-2">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingContracts.map((c: any) => {
                    const partner = Array.isArray(c.partners) ? c.partners[0] : c.partners;
                    return (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-3 py-2 font-mono text-xs">{c.contract_no}</td>
                        <td className="px-3 py-2 font-medium">{c.title}</td>
                        <td className="px-3 py-2 text-muted-foreground">{partner?.name ?? "-"}</td>
                        <td className="px-3 py-2">{fmtDate(c.end_date)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtCurrency(c.value_amount)}</td>
                        <td className="px-3 py-2"><ContractStatusBadge status={c.status as never} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">ไม่มีสัญญาที่จะครบกำหนดใน 90 วัน</p>
          )}
        </CardContent>
      </Card>
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
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
