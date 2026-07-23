import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Lock, ArrowRight, Sparkles, Trophy, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { getSupabase } from "@/lib/supabase";
import { LifecycleStepper } from "@/components/project/lifecycle-stepper";
import { OverviewTab } from "@/components/project/overview-tab";
import { ProjectDocumentsList } from "@/components/project/documents-list";
import { SupplierQuotationsTab } from "@/components/project/supplier-quotations-tab";
import { CustomerQuotationsTab } from "@/components/project/customer-quotations-tab";
import { MilestonesTab } from "@/components/project/milestones-tab";
import { TeamTab } from "@/components/project/team-tab";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import {
  LIFECYCLE_LABEL, STATUS_TONE, nextStatuses,
  type ProjectLifecycleStatus,
} from "@/lib/project-lifecycle";
import { fmtCurrency } from "@/lib/format";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  head: () => ({ meta: [{ title: "รายละเอียดโครงการ | Document Hub" }] }),
  component: ProjectDetail,
});

function Denied({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/30 py-16 text-sm text-muted-foreground">
      <Lock className="h-6 w-6" />
      <div>คุณไม่มีสิทธิ์ดู{label}</div>
    </div>
  );
}

// Tab order intentionally mirrors project workflow.
const TAB_ORDER = [
  { value: "overview", label: "1 · ภาพรวม" },
  { value: "rfq", label: "2 · RFQ / Spec" },
  { value: "supplier", label: "3 · ใบเสนอ Supplier" },
  { value: "customer", label: "4 · ยื่นข้อเสนอลูกค้า" },
  { value: "contract", label: "5 · สัญญา" },
  { value: "milestones", label: "6 · งวดงาน" },
  { value: "team", label: "7 · ทีมและสิทธิ์" },
] as const;

function ProjectDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const sb = getSupabase();
  const qc = useQueryClient();
  const { data: perms, isLoading: permsLoading } = useProjectPermissions(id);

  const { data: p, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data, error } = await sb
        .from("projects")
        .select("*, departments(name_th)")
        .eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading || permsLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }
  if (!p) return <div className="py-16 text-center text-muted-foreground">ไม่พบโครงการ</div>;

  const isAdmin = perms?.isAdmin ?? false;
  const canEditProject = isAdmin || (perms?.canEditProject ?? false);
  const status = (p.status ?? "draft") as ProjectLifecycleStatus;
  const nextOptions = nextStatuses(status);

  const advance = async (next: ProjectLifecycleStatus) => {
    const { error } = await sb.from("projects").update({ status: next }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`อัปเดตสถานะเป็น: ${LIFECYCLE_LABEL[next]}`);
    qc.invalidateQueries({ queryKey: ["project", id] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/projects" })} className="-ml-2">
        <ArrowLeft className="mr-2 h-4 w-4" />กลับรายการโครงการ
      </Button>

      {/* Header + Next-action banner */}
      <div className="tile grid gap-5 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono uppercase tracking-wider">{p.code}</span>
            <span>·</span>
            <Badge variant="outline" className={STATUS_TONE[status]}>{LIFECYCLE_LABEL[status]}</Badge>
            {p.customer_name && <><span>·</span><span className="truncate">ลูกค้า {p.customer_name}</span></>}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            {p.project_type && <span>ประเภท {p.project_type}</span>}
            {(p.contract_value ?? p.budget) != null && (
              <span>มูลค่าสัญญา <span className="font-semibold text-foreground tabular-nums">{fmtCurrency(p.contract_value ?? p.budget, "THB")}</span></span>
            )}
          </div>
        </div>

        {canEditProject && nextOptions.length > 0 && (
          <div className="flex flex-col items-stretch gap-2 md:items-end">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              ขั้นต่อไป
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              {nextOptions.map((n) => {
                const isWin = n === "won";
                const isLose = n === "lost";
                return (
                  <Button
                    key={n}
                    size="lg"
                    variant={isLose ? "outline" : "default"}
                    className={`rounded-full ${isWin ? "bg-success text-success-foreground hover:bg-success/90" : ""} ${isLose ? "border-destructive/40 text-destructive hover:bg-destructive/10" : ""}`}
                    onClick={() => advance(n)}
                  >
                    {isWin && <Trophy className="mr-2 h-4 w-4" />}
                    {isLose && <XCircle className="mr-2 h-4 w-4" />}
                    {!isWin && !isLose && <Sparkles className="mr-2 h-4 w-4" />}
                    {LIFECYCLE_LABEL[n]}
                    {!isWin && !isLose && <ArrowRight className="ml-2 h-4 w-4" />}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Stepper */}
      <div className="tile p-3">
        <LifecycleStepper status={status} />
      </div>

      {/* Workflow tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <div className="overflow-x-auto">
          <TabsList className="inline-flex h-auto flex-nowrap gap-1 rounded-full bg-muted p-1">
            {TAB_ORDER.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="whitespace-nowrap rounded-full px-4 py-1.5 text-xs data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-5">
          {perms?.canSeeOverview ? <OverviewTab project={p} /> : <Denied label="ข้อมูลโครงการ" />}
        </TabsContent>

        <TabsContent value="rfq" className="mt-5 space-y-4">
          {perms?.canSeeSpec ? (
            <>
              <SectionCard title="RFQ / Specification" description="เอกสารข้อกำหนดที่ส่งให้ Supplier">
                <ProjectDocumentsList projectId={id} type="rfq_spec" emptyLabel="ยังไม่มีไฟล์ RFQ / Spec" />
              </SectionCard>
              <SectionCard title="TOR / Scope of Work" description="รายละเอียดขอบเขตงาน">
                <ProjectDocumentsList projectId={id} type="tor" emptyLabel="ยังไม่มีไฟล์ TOR" />
              </SectionCard>
            </>
          ) : <Denied label="RFQ / Spec" />}
        </TabsContent>

        <TabsContent value="supplier" className="mt-5">
          {perms?.canSeeSupplier ? (
            <SupplierQuotationsTab
              projectId={id}
              canEdit={isAdmin || (perms?.canUpload ?? false)}
              canSeePrice={perms?.canSeeSupplierPrice ?? false}
            />
          ) : <Denied label="ใบเสนอ Supplier" />}
        </TabsContent>

        <TabsContent value="customer" className="mt-5">
          {perms?.canSeeCustomer ? (
            <CustomerQuotationsTab
              projectId={id}
              canEdit={isAdmin || (perms?.canUpload ?? false)}
              canSeePrice={perms?.canSeeCustomerPrice ?? false}
            />
          ) : <Denied label="ใบเสนอลูกค้า" />}
        </TabsContent>

        <TabsContent value="contract" className="mt-5 space-y-4">
          {perms?.canSeeContract ? (
            <>
              <SectionCard title="สัญญา" description="สัญญาที่ลงนามและเอกสารแนบ">
                <ProjectDocumentsList projectId={id} type="contract" emptyLabel="ยังไม่มีไฟล์สัญญา" />
              </SectionCard>
              <SectionCard title="ใบเสนอราคาฉบับสุดท้าย" description="ที่ผูกกับสัญญา">
                <ProjectDocumentsList projectId={id} type="final_quotation" emptyLabel="ยังไม่มีไฟล์" />
              </SectionCard>
            </>
          ) : <Denied label="สัญญา" />}
        </TabsContent>

        <TabsContent value="milestones" className="mt-5">
          {perms?.canSeeMilestones ? (
            <MilestonesTab
              projectId={id}
              contractValue={p.contract_value ?? p.budget ?? null}
              canEdit={isAdmin || (perms?.canEditMilestones ?? false)}
              canSeePayment={perms?.canSeeMilestonePayment ?? false}
            />
          ) : <Denied label="งวดงาน" />}
        </TabsContent>

        <TabsContent value="team" className="mt-5">
          <TeamTab projectId={id} isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="tile p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

// Suppress unused Link import (keep for future in-tab nav)
void Link;
