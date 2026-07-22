import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSupabase } from "@/lib/supabase";
import { LifecycleStepper } from "@/components/project/lifecycle-stepper";
import { OverviewTab } from "@/components/project/overview-tab";
import { ProjectDocumentsList } from "@/components/project/documents-list";
import { SupplierQuotationsTab } from "@/components/project/supplier-quotations-tab";
import { CustomerQuotationsTab } from "@/components/project/customer-quotations-tab";
import { MilestonesTab } from "@/components/project/milestones-tab";
import { TeamTab } from "@/components/project/team-tab";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import type { ProjectLifecycleStatus } from "@/lib/project-lifecycle";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  head: () => ({ meta: [{ title: "รายละเอียดโครงการ | Document Hub" }] }),
  component: ProjectDetail,
});

function Denied({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border bg-muted/40 py-12 text-sm text-muted-foreground">
      <Lock className="h-6 w-6" />
      <div>คุณไม่มีสิทธิ์ดู{label}</div>
    </div>
  );
}

function ProjectDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const sb = getSupabase();
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
  const status = (p.status ?? "draft") as ProjectLifecycleStatus;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/projects" })}>
        <ArrowLeft className="mr-2 h-4 w-4" />กลับรายการโครงการ
      </Button>

      <PageHeader
        title={p.name}
        description={<span className="font-mono text-xs">{p.code}</span>}
      />

      <div className="rounded-lg border bg-card p-2">
        <LifecycleStepper status={status} />
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4 md:grid-cols-7">
          <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
          <TabsTrigger value="rfq">RFQ / Spec</TabsTrigger>
          <TabsTrigger value="supplier">ใบเสนอ Supplier</TabsTrigger>
          <TabsTrigger value="customer">ใบเสนอลูกค้า</TabsTrigger>
          <TabsTrigger value="contract">สัญญา</TabsTrigger>
          <TabsTrigger value="milestones">งวดงาน</TabsTrigger>
          <TabsTrigger value="team">ทีม</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          {perms?.canSeeOverview ? <OverviewTab project={p} /> : <Denied label="ข้อมูลโครงการ" />}
        </TabsContent>

        <TabsContent value="rfq" className="mt-4 space-y-4">
          {perms?.canSeeSpec ? (
            <>
              <div>
                <h3 className="mb-2 text-sm font-semibold">RFQ / Specification</h3>
                <ProjectDocumentsList projectId={id} type="rfq_spec" emptyLabel="ยังไม่มีไฟล์ RFQ / Spec" />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">TOR / Scope of Work</h3>
                <ProjectDocumentsList projectId={id} type="tor" emptyLabel="ยังไม่มีไฟล์ TOR" />
              </div>
            </>
          ) : <Denied label="RFQ / Spec" />}
        </TabsContent>

        <TabsContent value="supplier" className="mt-4">
          {perms?.canSeeSupplier ? (
            <SupplierQuotationsTab
              projectId={id}
              canEdit={isAdmin || (perms?.canUpload ?? false)}
              canSeePrice={perms?.canSeeSupplierPrice ?? false}
            />
          ) : <Denied label="ใบเสนอ Supplier" />}
        </TabsContent>

        <TabsContent value="customer" className="mt-4">
          {perms?.canSeeCustomer ? (
            <CustomerQuotationsTab
              projectId={id}
              canEdit={isAdmin || (perms?.canUpload ?? false)}
              canSeePrice={perms?.canSeeCustomerPrice ?? false}
            />
          ) : <Denied label="ใบเสนอลูกค้า" />}
        </TabsContent>

        <TabsContent value="contract" className="mt-4 space-y-4">
          {perms?.canSeeContract ? (
            <>
              <div>
                <h3 className="mb-2 text-sm font-semibold">สัญญา</h3>
                <ProjectDocumentsList projectId={id} type="contract" emptyLabel="ยังไม่มีไฟล์สัญญา" />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">ใบเสนอราคาฉบับสุดท้าย (ผูกกับสัญญา)</h3>
                <ProjectDocumentsList projectId={id} type="final_quotation" emptyLabel="ยังไม่มีไฟล์" />
              </div>
            </>
          ) : <Denied label="สัญญา" />}
        </TabsContent>

        <TabsContent value="milestones" className="mt-4">
          {perms?.canSeeMilestones ? (
            <MilestonesTab
              projectId={id}
              contractValue={p.contract_value ?? p.budget ?? null}
              canEdit={isAdmin || (perms?.canEditMilestones ?? false)}
              canSeePayment={perms?.canSeeMilestonePayment ?? false}
            />
          ) : <Denied label="งวดงาน" />}
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          <TeamTab projectId={id} isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
