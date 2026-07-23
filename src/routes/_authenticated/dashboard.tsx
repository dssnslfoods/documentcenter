import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  FileText, FileSignature, AlertTriangle, Clock, CheckCircle2, DollarSign,
  ShoppingCart, TrendingUp, Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { getSupabase } from "@/lib/supabase";
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

const CHART_COLORS = ["oklch(0.47 0.13 258)", "oklch(0.5 0.09 190)", "oklch(0.75 0.16 70)", "oklch(0.63 0.17 148)", "oklch(0.58 0.22 27)"];

function Dashboard() {
  const { data: kpi, isLoading } = useQuery({
    queryKey: ["dashboard-kpi"],
    queryFn: async () => {
      const sb = getSupabase();
      const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);

      const [docs, activeDocs, expiring, expired, quotPending, procInProg, valSum] = await Promise.all([
        sb.from("documents").select("id", { count: "exact", head: true }),
        sb.from("documents").select("id", { count: "exact", head: true }).eq("status", "active"),
        sb.from("contracts").select("id", { count: "exact", head: true }).eq("status", "active").lte("end_date", in30).gte("end_date", today),
        sb.from("contracts").select("id", { count: "exact", head: true }).lt("end_date", today).neq("status", "archived"),
        sb.from("quotations").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review", "negotiation"]),
        sb.from("procurements").select("id", { count: "exact", head: true }).in("status", ["approved", "contracting", "in_progress"]),
        sb.from("contracts").select("value_amount").eq("status", "active"),
      ]);

      const totalValue = (valSum.data ?? []).reduce((s: number, r: { value_amount: number | null }) => s + (r.value_amount ?? 0), 0);

      return {
        totalDocs: docs.count ?? 0,
        activeDocs: activeDocs.count ?? 0,
        expiring30: expiring.count ?? 0,
        expired: expired.count ?? 0,
        quotPending: quotPending.count ?? 0,
        procInProgress: procInProg.count ?? 0,
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
        proposal_submitted: "Proposal", won: "ชนะงาน", lost: "แพ้งาน",
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
        .limit(10);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="ภาพรวม" description="Executive Dashboard — สถานะเอกสาร สัญญา และงานสำคัญขององค์กร" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={FileText} label="เอกสารทั้งหมด" value={fmtNumber(kpi?.totalDocs)} loading={isLoading} />
        <KpiCard icon={CheckCircle2} label="เอกสารกำลังใช้งาน" value={fmtNumber(kpi?.activeDocs)} loading={isLoading} tone="success" />
        <KpiCard icon={Clock} label="สัญญาใกล้หมดอายุ (30 วัน)" value={fmtNumber(kpi?.expiring30)} loading={isLoading} tone="warning" />
        <KpiCard icon={AlertTriangle} label="สัญญาหมดอายุแล้ว" value={fmtNumber(kpi?.expired)} loading={isLoading} tone="destructive" />
        <KpiCard icon={FileSignature} label="ใบเสนอราคารอพิจารณา" value={fmtNumber(kpi?.quotPending)} loading={isLoading} />
        <KpiCard icon={ShoppingCart} label="จัดจ้างระหว่างดำเนินการ" value={fmtNumber(kpi?.procInProgress)} loading={isLoading} />
        <KpiCard icon={DollarSign} label="มูลค่าสัญญาที่ใช้งานอยู่" value={fmtCurrency(kpi?.totalContractValue)} loading={isLoading} tone="accent" />
        <KpiCard icon={TrendingUp} label="งานที่รับผิดชอบ" value="—" loading={false} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>จำนวนเอกสารแยกตามประเภท</CardTitle>
          </CardHeader>
          <CardContent>
            {docsByType && docsByType.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={docsByType}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="count" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-12 text-center text-sm text-muted-foreground">ยังไม่มีข้อมูล</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>สัดส่วนหมวดเอกสาร</CardTitle>
          </CardHeader>
          <CardContent>
            {docsByType && docsByType.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={docsByType} dataKey="count" nameKey="name" innerRadius={50} outerRadius={100}>
                    {docsByType.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-12 text-center text-sm text-muted-foreground">ยังไม่มีข้อมูล</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline โครงการตาม lifecycle</CardTitle>
          </CardHeader>
          <CardContent>
            {pipeline && pipeline.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={pipeline}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-12 text-center text-sm text-muted-foreground">ยังไม่มีโครงการ</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>งวดงานครบกำหนดใน 30 วัน</CardTitle>
            <Link to="/projects" className="text-xs text-primary hover:underline">ดูโครงการทั้งหมด →</Link>
          </CardHeader>
          <CardContent>
            {upcomingMilestones && upcomingMilestones.length > 0 ? (
              <div className="divide-y">
                {upcomingMilestones.map((m: any) => {
                  const proj = Array.isArray(m.projects) ? m.projects[0] : m.projects;
                  return (
                    <Link key={m.id} to="/projects/$id" params={{ id: m.project_id }} className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-muted/40">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{m.description}</div>
                        <div className="truncate text-xs text-muted-foreground">{proj?.code} · {proj?.name}</div>
                      </div>
                      <div className="shrink-0 text-xs text-muted-foreground tabular-nums">{fmtDate(m.due_date)}</div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">ไม่มีงวดงานครบกำหนดใน 30 วัน</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>สัญญาที่จะครบกำหนดใน 90 วัน</CardTitle>
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
                      <td className="px-3 py-2 text-right font-mono">{fmtCurrency(c.value_amount)}</td>
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
          <div className="mt-4 text-right">
            <Link to="/contracts" className="text-xs text-primary hover:underline">ดูสัญญาทั้งหมด →</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, loading, tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
  loading: boolean;
  tone?: "default" | "success" | "warning" | "destructive" | "accent";
}) {
  const toneClass = {
    default: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    destructive: "bg-destructive/15 text-destructive",
    accent: "bg-accent/10 text-accent",
  }[tone];
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs text-muted-foreground">{label}</div>
          <div className="mt-0.5 truncate text-lg font-semibold tabular-nums">
            {loading ? <span className="inline-block h-4 w-16 animate-pulse rounded bg-muted" /> : value}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
