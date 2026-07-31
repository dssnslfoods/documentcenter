import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { ArrowLeft, Loader2, Lock, Trophy, XCircle, CheckCircle2, CircleDashed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { getSupabase } from "@/lib/supabase";
import { LifecycleStepper } from "@/components/project/lifecycle-stepper";
import { OverviewTab } from "@/components/project/overview-tab";
import { ProjectDocumentsList } from "@/components/project/documents-list";
import { ProjectSpecNotesList } from "@/components/project/spec-notes-list";
import { SupplierQuotationsTab } from "@/components/project/supplier-quotations-tab";
import { CustomerQuotationsTab } from "@/components/project/customer-quotations-tab";
import { FinalCustomerQuotation } from "@/components/project/final-customer-quotation";
import { MilestonesTab } from "@/components/project/milestones-tab";
import { TimelineTab } from "@/components/project/timeline-tab";
import { TeamTab } from "@/components/project/team-tab";
import { ProjectHistoryTab } from "@/components/project/history-tab";

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
  { value: "timeline", label: "6 · แผนงาน (Timeline)" },
  { value: "milestones", label: "7 · งวดงาน" },
  { value: "team", label: "8 · ทีมและสิทธิ์" },
  { value: "history", label: "9 · ประวัติการแก้ไข" },
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

  // ---------- Auto-detect readiness for next lifecycle stage from data ----------
  const { data: signals } = useQuery({
    queryKey: ["project-signals", id],
    queryFn: async () => {
      const [rfq, rfqNote, sup, supSel, cus, ms] = await Promise.all([
        sb.from("project_documents").select("id", { count: "exact", head: true }).eq("project_id", id).eq("document_type", "rfq_spec"),
        sb.from("project_spec_notes").select("id", { count: "exact", head: true }).eq("project_id", id).eq("note_type", "rfq_spec"),
        sb.from("supplier_quotations").select("id", { count: "exact", head: true }).eq("project_id", id),
        sb.from("supplier_quotations").select("id", { count: "exact", head: true }).eq("project_id", id).eq("is_selected", true),
        sb.from("customer_quotations").select("id", { count: "exact", head: true }).eq("project_id", id),
        sb.from("project_milestones").select("status").eq("project_id", id),
      ]);
      const mlist = (ms.data ?? []) as { status: string }[];
      return {
        rfqCount: (rfq.count ?? 0) + (rfqNote.count ?? 0),
        supCount: sup.count ?? 0,
        supSelectedCount: supSel.count ?? 0,
        cusCount: cus.count ?? 0,
        milestoneCount: mlist.length,
        milestoneAllDone: mlist.length > 0 && mlist.every((m) => m.status === "completed"),
      };
    },
  });
  const autoAdvancedRef = useRef<string | null>(null);

  const isAdmin = perms?.isAdmin ?? false;
  const canEditProject = isAdmin || (perms?.canEditProject ?? false);
  const status = (p?.status ?? "draft") as ProjectLifecycleStatus;



  const isInhouse = !!(p as { is_inhouse?: boolean } | undefined)?.is_inhouse;

  // Determine what data-driven step is currently pending
  type Gate = { need: string; ready: boolean; nextIfReady: ProjectLifecycleStatus | null };
  const gate: Gate = (() => {
    const s = signals;
    if (isInhouse && (status === "draft" || status === "rfq_sent" || status === "quotation_received")) {
      // งานผลิตภายใน: ข้าม RFQ + ใบเสนอราคา Supplier
      return {
        need: "สร้างใบเสนอราคาให้ลูกค้า (งานผลิตภายใน ไม่ต้องมี RFQ / Supplier)",
        ready: !!s && s.cusCount > 0,
        nextIfReady: "proposal_submitted",
      };
    }
    switch (status) {
      case "draft":
        return { need: "อัปโหลดเอกสาร RFQ / Spec ในแท็บ RFQ", ready: !!s && s.rfqCount > 0, nextIfReady: "rfq_sent" };
      case "rfq_sent":
        return { need: "บันทึกใบเสนอราคาจาก Supplier อย่างน้อย 1 ราย", ready: !!s && s.supCount > 0, nextIfReady: "quotation_received" };
      case "quotation_received":
        return {
          need: "เลือก Supplier (Mark as Final) และสร้างใบเสนอราคาให้ลูกค้า",
          ready: !!s && s.supSelectedCount > 0 && s.cusCount > 0,
          nextIfReady: "proposal_submitted",
        };
      case "proposal_submitted":
        return { need: "รอผลการเสนอราคาจากลูกค้า — ทีมขายกด ชนะ / แพ้ เอง", ready: false, nextIfReady: null };
      case "won":
        return { need: "กำหนดงวดงาน (Milestones) เพื่อเริ่มดำเนินโครงการ", ready: !!s && s.milestoneCount > 0, nextIfReady: "in_progress" };
      case "in_progress":
        return { need: "ปิดงวดงานทั้งหมดให้เป็นสถานะเสร็จสิ้น", ready: !!s && s.milestoneAllDone, nextIfReady: "completed" };
      default:
        return { need: "", ready: false, nextIfReady: null };
    }
  })();


  // (autoAdvancedRef declared above)
  const advance = async (next: ProjectLifecycleStatus, silent = false) => {
    const { error } = await sb.from("projects").update({ status: next }).eq("id", id);
    if (error) { if (!silent) toast.error(error.message); return; }
    if (!silent) toast.success(`อัปเดตสถานะเป็น: ${LIFECYCLE_LABEL[next]}`);
    else toast.success(`ระบบตรวจพบข้อมูลครบ → เลื่อนไปยัง "${LIFECYCLE_LABEL[next]}" อัตโนมัติ`);
    qc.invalidateQueries({ queryKey: ["project", id] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };

  // Auto-advance when signals meet the gate
  useEffect(() => {
    if (!canEditProject) return;
    if (!gate.ready || !gate.nextIfReady) return;
    const key = `${id}:${status}→${gate.nextIfReady}`;
    if (autoAdvancedRef.current === key) return;
    autoAdvancedRef.current = key;
    void advance(gate.nextIfReady, true);
     
  }, [gate.ready, gate.nextIfReady, canEditProject, id, status]);

  if (isLoading || permsLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }
  if (!p) return <div className="py-16 text-center text-muted-foreground">ไม่พบโครงการ</div>;

  const showManualBranch = status === "proposal_submitted"; // Won / Lost only

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/projects" })} className="-ml-2">
        <ArrowLeft className="mr-2 h-4 w-4" />กลับรายการโครงการ
      </Button>

      {/* Header + auto-detect status banner */}
      <div className="tile grid gap-5 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono uppercase tracking-wider">{p.code}</span>
            <span>·</span>
            <Badge variant="outline" className={STATUS_TONE[status]}>{LIFECYCLE_LABEL[status]}</Badge>
            {isInhouse && <Badge variant="outline" className="bg-success/10 text-success">ผลิตภายใน</Badge>}
            {p.customer_name && <><span>·</span><span className="truncate">ลูกค้า {p.customer_name}</span></>}


          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            {p.project_type && <span>ประเภท {p.project_type}</span>}
            {(p.contract_value ?? p.budget) != null && (
              <span>มูลค่าสัญญา (ก่อน VAT) <span className="font-semibold text-foreground tabular-nums">{fmtCurrency(p.contract_value ?? p.budget, "THB")}</span></span>
            )}
            {p.vat_rate != null && (
              <span>VAT {Number(p.vat_rate).toFixed(2)}% <span className="tabular-nums">{fmtCurrency(p.vat_amount ?? 0, "THB")}</span></span>
            )}
            {p.contract_value_incl_vat != null && (
              <span>รวม VAT <span className="font-semibold text-foreground tabular-nums">{fmtCurrency(p.contract_value_incl_vat, "THB")}</span></span>
            )}
          </div>
        </div>

        {/* Right: auto-detect indicator OR Won/Lost manual branch */}
        {showManualBranch && canEditProject ? (
          <div className="flex flex-col items-stretch gap-2 md:items-end">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">ผลการเสนอราคา</div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              {nextStatuses(status).map((n) => {
                const isWin = n === "won";
                return (
                  <Button
                    key={n}
                    size="lg"
                    variant={isWin ? "default" : "outline"}
                    className={`rounded-full ${isWin ? "bg-success text-success-foreground hover:bg-success/90" : "border-destructive/40 text-destructive hover:bg-destructive/10"}`}
                    onClick={() => advance(n)}
                  >
                    {isWin ? <Trophy className="mr-2 h-4 w-4" /> : <XCircle className="mr-2 h-4 w-4" />}
                    {LIFECYCLE_LABEL[n]}
                  </Button>
                );
              })}
            </div>
          </div>
        ) : gate.nextIfReady ? (
          <div className="flex max-w-sm flex-col items-stretch gap-1.5 rounded-xl border bg-muted/40 p-3 md:items-end md:text-right">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {gate.ready ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <CircleDashed className="h-3.5 w-3.5" />}
              ระบบเลื่อนขั้นอัตโนมัติ
            </div>
            <div className="text-sm font-medium text-foreground">
              {gate.ready ? `กำลังเลื่อนไป "${LIFECYCLE_LABEL[gate.nextIfReady]}"…` : `รอ: ${gate.need}`}
            </div>
            <div className="text-[11px] text-muted-foreground">
              ถัดไป: <span className="font-medium text-foreground">{LIFECYCLE_LABEL[gate.nextIfReady]}</span>
            </div>
          </div>
        ) : null}
      </div>


      {/* Stepper */}
      <div className="tile p-3">
        <LifecycleStepper status={status} />
      </div>

      {/* Workflow tabs */}
      <Tabs defaultValue={perms?.canSeeOverview === false ? "timeline" : "overview"} className="w-full">
        <div className="overflow-x-auto">
          <TabsList className="inline-flex h-auto flex-nowrap gap-1 rounded-full bg-muted p-1">
            {TAB_ORDER
              .filter((t) => {
                if (perms?.isAdmin) return true;
                switch (t.value) {
                  case "overview": return perms?.canSeeOverview ?? false;
                  case "rfq": return perms?.canSeeSpec ?? false;
                  case "supplier": return perms?.canSeeSupplier ?? false;
                  case "customer": return perms?.canSeeCustomer ?? false;
                  case "contract": return perms?.canSeeContract ?? false;
                  case "timeline": return perms?.canSeeTimeline ?? false;
                  case "milestones": return perms?.canSeeMilestones ?? false;

                  default: return true;
                }
              })
              .map((t) => (
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
          {perms?.canSeeOverview ? <OverviewTab project={p} canEdit={canEditProject} canSeePrice={perms?.canSeeCustomerPrice ?? true} /> : <Denied label="ข้อมูลโครงการ" />}
        </TabsContent>

        <TabsContent value="rfq" className="mt-5 space-y-4">
          {perms?.canSeeSpec ? (
            <>
              {isInhouse && (
                <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  โครงการนี้เป็นงานผลิตภายใน — ไม่บังคับให้มี RFQ / Spec แต่สามารถเพิ่มหรือแก้ไขได้ตลอดระหว่างดำเนินโครงการ
                </div>
              )}
              <SectionCard title="RFQ / Specification (ข้อความ)" description="กรอก spec แบบข้อความอิสระ สะดวกในการ copy ส่งให้ supplier — แก้ไขได้ตลอดโครงการ">
                <ProjectSpecNotesList
                  projectId={id}
                  type="rfq_spec"
                  emptyLabel="ยังไม่มีบันทึก spec แบบข้อความ"
                  canEdit={isAdmin || (perms?.canUpload ?? false)}
                />
              </SectionCard>
              <SectionCard title="Spec Preview (Reference)" description="อัปโหลดรูปแบบ/ตัวอย่าง spec ได้หลายรูปพร้อมกัน ดูตัวอย่างก่อนดาวน์โหลดได้">
                <ProjectDocumentsList projectId={id} type="rfq_spec" emptyLabel="ยังไม่มีรูป Spec Preview" gallery />
              </SectionCard>

              <SectionCard title="TOR / Scope of Work (ข้อความ)" description="รายละเอียดขอบเขตงานแบบข้อความ">
                <ProjectSpecNotesList
                  projectId={id}
                  type="tor"
                  emptyLabel="ยังไม่มีบันทึก TOR แบบข้อความ"
                  canEdit={isAdmin || (perms?.canUpload ?? false)}
                />
              </SectionCard>
              <SectionCard title="TOR / Scope of Work (ไฟล์แนบ)" description="ไฟล์ขอบเขตงาน">
                <ProjectDocumentsList projectId={id} type="tor" emptyLabel="ยังไม่มีไฟล์ TOR" />
              </SectionCard>
            </>
          ) : <Denied label="RFQ / Spec" />}
        </TabsContent>

        <TabsContent value="supplier" className="mt-5 space-y-4">
          {perms?.canSeeSupplier ? (
            <>
              {isInhouse && (
                <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  โครงการนี้เป็นงานผลิตภายใน — ไม่บังคับให้มีใบเสนอราคาจากคู่ค้า แต่สามารถเพิ่มได้ระหว่างดำเนินโครงการ
                </div>
              )}
              <SupplierQuotationsTab
                projectId={id}
                canEdit={isAdmin || (perms?.canUpload ?? false)}
                canSeePrice={perms?.canSeeSupplierPrice ?? false}
              />
            </>
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
                <div className="space-y-4">
                  <FinalCustomerQuotation
                    projectId={id}
                    canSeePrice={perms?.canSeeCustomerPrice ?? false}
                  />
                  <ProjectDocumentsList projectId={id} type="final_quotation" emptyLabel="ยังไม่มีไฟล์" />
                </div>
              </SectionCard>

            </>
          ) : <Denied label="สัญญา" />}
        </TabsContent>

        <TabsContent value="timeline" className="mt-5">
          {perms?.canSeeTimeline ? (
            <TimelineTab projectId={id} projectName={p?.name ?? p?.title ?? undefined} canEdit={perms?.canEditTimeline ?? false} />
          ) : <Denied label="แผนงาน" />}
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
          <TeamTab projectId={id} isAdmin={perms?.canManageTeam ?? false} />
        </TabsContent>


        <TabsContent value="history" className="mt-5">
          <ProjectHistoryTab projectId={id} />
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

