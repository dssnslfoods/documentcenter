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

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "รายงาน | Document Hub" }] }),
  component: ReportsPage,
});

const COLORS = [
  "oklch(0.47 0.13 258)", "oklch(0.5 0.09 190)", "oklch(0.75 0.16 70)",
  "oklch(0.63 0.17 148)", "oklch(0.58 0.22 27)", "oklch(0.55 0.15 300)",
];

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง", under_review: "กำลังตรวจ", pending_approval: "รออนุมัติ",
  pending_signature: "รอลงนาม", active: "มีผล", near_expiry: "ใกล้หมดอายุ",
  renewal_in_progress: "ต่ออายุ", expired: "หมดอายุ", terminated: "ยกเลิก", archived: "จัดเก็บ",
};

function ReportsPage() {
  const guard = usePageGuard("reports", "รายงาน");
  const { data, isLoading } = useQuery({
    enabled: guard.allowed,
    queryKey: ["reports-data"],
    queryFn: async () => {
      const sb = getSupabase();
      const [contracts, docs, projects] = await Promise.all([
        sb.from("contracts").select("status, value_amount, created_at"),
        sb.from("documents").select("category_id, status, document_categories(name_th)"),
        sb.from("projects").select("status, budget, created_at"),
      ]);

      // Contract status distribution
      const contractStatus: Record<string, number> = {};
      let totalContractValue = 0;
      (contracts.data ?? []).forEach((c: { status: string; value_amount: number | null }) => {
        contractStatus[c.status] = (contractStatus[c.status] ?? 0) + 1;
        if (c.status === "active") totalContractValue += c.value_amount ?? 0;
      });

      // Monthly created (last 12 months) — contracts & projects
      const now = new Date();
      const months: { key: string; label: string; contracts: number; projects: number }[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        months.push({ key, label: d.toLocaleDateString("th-TH", { month: "short", year: "2-digit" }), contracts: 0, projects: 0 });
      }
      const mMap = new Map(months.map((m) => [m.key, m]));
      (contracts.data ?? []).forEach((c: { created_at: string }) => {
        const k = c.created_at.slice(0, 7);
        const m = mMap.get(k); if (m) m.contracts += 1;
      });
      (projects.data ?? []).forEach((p: { created_at: string }) => {
        const k = (p.created_at ?? "").slice(0, 7);
        const m = mMap.get(k); if (m) m.projects += 1;
      });

      // Documents by category
      const catMap = new Map<string, number>();
      (docs.data ?? []).forEach((d: { document_categories: { name_th: string } | { name_th: string }[] | null }) => {
        const c = Array.isArray(d.document_categories) ? d.document_categories[0] : d.document_categories;
        const name = c?.name_th ?? "อื่นๆ";
        catMap.set(name, (catMap.get(name) ?? 0) + 1);
      });
      const docsByCat = Array.from(catMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);

      // Projects
      const projStatus: Record<string, number> = {};
      let totalProjectBudget = 0;
      (projects.data ?? []).forEach((p: { status: string; budget: number | null }) => {
        projStatus[p.status] = (projStatus[p.status] ?? 0) + 1;
        totalProjectBudget += p.budget ?? 0;
      });

      // Win / Loss statistics
      const won = (projects.data ?? []).filter((p: { status: string }) =>
        ["won", "in_progress", "completed"].includes(p.status)).length;
      const lost = projStatus["lost"] ?? 0;
      const decided = won + lost;
      const winRate = decided > 0 ? Math.round((won / decided) * 100) : 0;

      // Win/Loss by month (12 months)
      const wl = months.map((m) => ({ label: m.label, key: m.key, won: 0, lost: 0 }));
      const wlMap = new Map(wl.map((m) => [m.key, m]));
      (projects.data ?? []).forEach((p: { status: string; created_at: string }) => {
        const m = wlMap.get((p.created_at ?? "").slice(0, 7));
        if (!m) return;
        if (["won", "in_progress", "completed"].includes(p.status)) m.won += 1;
        else if (p.status === "lost") m.lost += 1;
      });

      return {
        contractStatus: Object.entries(contractStatus).map(([k, v]) => ({ name: CONTRACT_STATUS_LABELS[k] ?? k, value: v })),
        totalContractValue,
        totalProjectBudget,
        totalContracts: (contracts.data ?? []).length,
        totalDocs: (docs.data ?? []).length,
        totalProjects: (projects.data ?? []).length,
        months,
        docsByCat,
        projStatus: Object.entries(projStatus).map(([k, v]) => ({ name: k, value: v })),
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
      <PageHeader title="รายงาน" description="สรุปข้อมูลเชิงบริหารทุกโมดูล — สัญญา เอกสาร โครงการ" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="สัญญาทั้งหมด" value={fmtNumber(data.totalContracts)} sub={`มูลค่าใช้งาน ${fmtCurrency(data.totalContractValue)}`} />
        <KpiCard label="เอกสารในระบบ" value={fmtNumber(data.totalDocs)} sub="ทุกหมวดหมู่" />
        <KpiCard label="โครงการ" value={fmtNumber(data.totalProjects)} sub={`งบรวม ${fmtCurrency(data.totalProjectBudget)}`} />
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
          <CardHeader><CardTitle className="text-base">สัญญาและโครงการรายเดือน (12 เดือน)</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.months}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="contracts" name="สัญญา" stroke={COLORS[0]} strokeWidth={2} />
                <Line type="monotone" dataKey="projects" name="โครงการ" stroke={COLORS[2]} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">สัดส่วนสถานะสัญญา</CardTitle></CardHeader>
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
          <CardHeader><CardTitle className="text-base">เอกสารแยกตามหมวดหมู่</CardTitle></CardHeader>
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
