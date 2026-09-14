import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabase } from "@/lib/supabase";
import { fmtCurrency, fmtNumber } from "@/lib/format";
import { usePageGuard } from "@/hooks/use-page-access";
import { fetchProjectFinancials } from "@/lib/project-financials";
import { LIFECYCLE_LABEL, type ProjectLifecycleStatus } from "@/lib/project-lifecycle";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "รายงาน | Document Hub" }] }),
  component: ReportsPage,
});

const COLORS = [
  "oklch(0.47 0.13 258)", "oklch(0.5 0.09 190)", "oklch(0.75 0.16 70)",
  "oklch(0.63 0.17 148)", "oklch(0.58 0.22 27)", "oklch(0.55 0.15 300)",
];

const DOC_TYPE_LABEL: Record<string, string> = {
  rfq_spec: "RFQ / Spec", tor: "TOR", contract: "สัญญา / ใบสั่งจ้าง", final_quotation: "ใบเสนอราคา Final", other: "อื่นๆ",
};

const WON: ProjectLifecycleStatus[] = ["won", "in_progress", "completed"];

function ReportsPage() {
  const guard = usePageGuard("reports", "รายงาน");
  const { data, isLoading } = useQuery({
    enabled: guard.allowed,
    queryKey: ["reports-data"],
    queryFn: async () => {
      const sb = getSupabase();
      // ข้อมูลจากโครงการ (ตาราง contracts / documents เดิมไม่มีการใช้งานแล้ว)
      const [projectsRes, docsRes] = await Promise.all([
        sb.from("projects").select("id, status, created_at").is("archived_at", null),
        sb.from("project_documents").select("document_type, uploaded_at"),
      ]);
      if (projectsRes.error) throw projectsRes.error;
      if (docsRes.error) throw docsRes.error;
      const projects = (projectsRes.data ?? []) as { id: string; status: ProjectLifecycleStatus; created_at: string }[];
      const docs = (docsRes.data ?? []) as { document_type: string | null; uploaded_at: string | null }[];

      const wonProjects = projects.filter((p) => WON.includes(p.status));
      const financials = await fetchProjectFinancials(wonProjects.map((p) => p.id));
      const valueOf = (id: string) => financials.get(id)?.contract_value ?? 0;
      const totalContractValue = wonProjects.filter((p) => p.status !== "completed").reduce((s, p) => s + valueOf(p.id), 0);
      const totalWonValue = wonProjects.reduce((s, p) => s + valueOf(p.id), 0);

      // Monthly (last 12 months) — contract documents & new projects
      const now = new Date();
      const months: { key: string; label: string; contracts: number; projects: number }[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        months.push({ key, label: d.toLocaleDateString("th-TH", { month: "short", year: "2-digit" }), contracts: 0, projects: 0 });
      }
      const mMap = new Map(months.map((m) => [m.key, m]));
      docs.filter((d) => d.document_type === "contract").forEach((d) => {
        const m = mMap.get((d.uploaded_at ?? "").slice(0, 7)); if (m) m.contracts += 1;
      });
      projects.forEach((p) => {
        const m = mMap.get((p.created_at ?? "").slice(0, 7)); if (m) m.projects += 1;
      });

      const catMap = new Map<string, number>();
      docs.forEach((d) => {
        const name = DOC_TYPE_LABEL[d.document_type ?? "other"] ?? "อื่นๆ";
        catMap.set(name, (catMap.get(name) ?? 0) + 1);
      });
      const docsByCat = Array.from(catMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

      const projStatus: Record<string, number> = {};
      projects.forEach((p) => { projStatus[p.status] = (projStatus[p.status] ?? 0) + 1; });

      // Win / Loss statistics
      const won = wonProjects.length;
      const lost = projStatus["lost"] ?? 0;
      const decided = won + lost;
      const winRate = decided > 0 ? Math.round((won / decided) * 100) : 0;

      const wl = months.map((m) => ({ label: m.label, key: m.key, won: 0, lost: 0 }));
      const wlMap = new Map(wl.map((m) => [m.key, m]));
      projects.forEach((p) => {
        const m = wlMap.get((p.created_at ?? "").slice(0, 7));
        if (!m) return;
        if (WON.includes(p.status)) m.won += 1;
        else if (p.status === "lost") m.lost += 1;
      });

      return {
        contractStatus: Object.entries(projStatus).map(([k, v]) => ({ name: LIFECYCLE_LABEL[k as ProjectLifecycleStatus] ?? k, value: v })),
        totalContractValue,
        totalWonValue,
        totalContracts: won,
        totalDocs: docs.length,
        totalProjects: projects.length,
        months,
        docsByCat,
        won, lost, decided, winRate,
        winLossMonths: wl,
      };
    },
  });

  if (!guard.allowed) return guard.node;

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="รายงาน" description="สรุปข้อมูลเชิงบริหารทุกโมดูล" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-muted/60" />)}
        </div>
        <div className="h-80 animate-pulse rounded-lg bg-muted/60" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="รายงาน" description="สรุปข้อมูลเชิงบริหาร — โครงการ สัญญา และเอกสาร" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="โครงการที่ได้งาน" value={fmtNumber(data.totalContracts)} sub={`มูลค่าที่ยังดำเนินการ ${fmtCurrency(data.totalContractValue)} (ก่อน VAT)`} />
        <KpiCard label="เอกสารโครงการ" value={fmtNumber(data.totalDocs)} sub="ทุกประเภท" />
        <KpiCard label="โครงการ" value={fmtNumber(data.totalProjects)} sub={`มูลค่าสัญญารวม (ชนะงาน) ${fmtCurrency(data.totalWonValue)}`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="ชนะงาน" value={fmtNumber(data.won)} sub="รวมที่ดำเนินการ/ปิดโครงการแล้ว" />
        <KpiCard label="แพ้งาน" value={fmtNumber(data.lost)} />
        <KpiCard label="ตัดสินผลแล้ว" value={fmtNumber(data.decided)} sub="ชนะ + แพ้" />
        <KpiCard label="อัตราชนะงาน" value={`${data.winRate}%`} sub="Win rate" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">สถิติชนะงาน / แพ้งาน รายเดือน (12 เดือน)</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.winLossMonths}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="won" name="ชนะงาน" stackId="wl" fill={COLORS[3]} radius={[0, 0, 0, 0]} />
              <Bar dataKey="lost" name="แพ้งาน" stackId="wl" fill={COLORS[4]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>



      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">โครงการใหม่และไฟล์สัญญารายเดือน (12 เดือน)</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.months}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="contracts" name="ไฟล์สัญญา" stroke={COLORS[0]} strokeWidth={2} />
                <Line type="monotone" dataKey="projects" name="โครงการ" stroke={COLORS[2]} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">สัดส่วนสถานะโครงการ</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.contractStatus} dataKey="value" nameKey="name" outerRadius={90} label={{ fontSize: 11 }}>
                  {data.contractStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">เอกสารโครงการแยกตามประเภท</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.docsByCat} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                <Tooltip />
                <Bar dataKey="value" fill={COLORS[1]} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
