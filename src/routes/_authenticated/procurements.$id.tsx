import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Calendar, Building2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabase } from "@/lib/supabase";
import { fmtDate, fmtCurrency } from "@/lib/format";
import { ProcurementStatusBadge } from "@/components/status-badge";

export const Route = createFileRoute("/_authenticated/procurements/$id")({
  head: () => ({ meta: [{ title: "รายละเอียดคำขอจัดซื้อ | Document Hub" }] }),
  component: ProcurementDetail,
});

const NEXT_STATUS: Record<string, string[]> = {
  draft: ["request_submitted", "cancelled"],
  request_submitted: ["under_review", "cancelled"],
  under_review: ["rfq", "pending_approval", "cancelled"],
  rfq: ["vendor_comparison", "cancelled"],
  vendor_comparison: ["pending_approval", "cancelled"],
  pending_approval: ["approved", "cancelled"],
  approved: ["contracting", "in_progress"],
  contracting: ["in_progress"],
  in_progress: ["delivered", "overdue", "cancelled"],
  delivered: ["inspection_pending", "completed"],
  inspection_pending: ["completed", "in_progress"],
  overdue: ["delivered", "cancelled"],
  completed: [],
  cancelled: [],
};

const LABELS: Record<string, string> = {
  draft: "ร่าง", request_submitted: "ยื่นคำขอ", under_review: "กำลังตรวจ", rfq: "RFQ",
  vendor_comparison: "เปรียบเทียบผู้ขาย", pending_approval: "รออนุมัติ", approved: "อนุมัติแล้ว",
  contracting: "ทำสัญญา", in_progress: "กำลังดำเนินการ", delivered: "ส่งมอบแล้ว",
  inspection_pending: "รอตรวจรับ", completed: "เสร็จสิ้น", cancelled: "ยกเลิก", overdue: "เกินกำหนด",
};

function ProcurementDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: p, isLoading } = useQuery({
    queryKey: ["procurement", id],
    queryFn: async () => {
      const { data, error } = await getSupabase().from("procurements")
        .select("*, departments(name_th), partners:supplier_id(name)").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const patch: Record<string, unknown> = { status };
      if (status === "approved") patch.approval_date = new Date().toISOString().slice(0, 10);
      if (status === "delivered") patch.delivery_date = new Date().toISOString().slice(0, 10);
      if (status === "completed") patch.inspection_date = new Date().toISOString().slice(0, 10);
      const { error } = await getSupabase().from("procurements").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["procurement", id] });
      qc.invalidateQueries({ queryKey: ["procurements"] });
      toast.success("อัปเดตสถานะสำเร็จ");
    },
    onError: (e: Error) => toast.error("อัปเดตไม่สำเร็จ", { description: e.message }),
  });

  if (isLoading) return <div className="p-6"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!p) return <div className="p-6">ไม่พบคำขอ</div>;

  const nextOptions = NEXT_STATUS[p.status] ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/procurements" })}>
          <ArrowLeft className="mr-1 h-4 w-4" />กลับ
        </Button>
      </div>
      <PageHeader title={p.title} description={<span className="font-mono text-sm">{p.procurement_no}</span>}
        actions={<ProcurementStatusBadge status={p.status} />} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>ข้อมูลคำขอ</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="ประเภท" value={p.procurement_type} />
            <Field label="วิธีจัดซื้อ" value={p.procurement_method} />
            <Field icon={Building2} label="แผนก" value={(p.departments as { name_th?: string } | null)?.name_th} />
            <Field icon={Building2} label="ผู้ขาย" value={(p.partners as { name?: string } | null)?.name} />
            <Field label="งบประมาณ" value={fmtCurrency(p.budget, "THB")} />
            <Field label="มูลค่าประเมิน" value={fmtCurrency(p.estimated_value, "THB")} />
            <Field label="มูลค่าอนุมัติ" value={fmtCurrency(p.approved_value, "THB")} />
            <div />
            <Field icon={Calendar} label="ยื่นคำขอ" value={fmtDate(p.request_date)} />
            <Field icon={Calendar} label="ต้องการรับ" value={fmtDate(p.need_date)} />
            <Field label="อนุมัติเมื่อ" value={fmtDate(p.approval_date)} />
            <Field label="ส่งมอบเมื่อ" value={fmtDate(p.delivery_date)} />
            <Field label="ตรวจรับเมื่อ" value={fmtDate(p.inspection_date)} />
            <Field label="ครบกำหนดชำระ" value={fmtDate(p.payment_due)} />
            {p.notes && <div className="sm:col-span-2"><Field label="หมายเหตุ" value={p.notes} multiline /></div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>ขั้นตอน</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">สถานะ: <strong>{LABELS[p.status]}</strong></p>
            {nextOptions.length > 0 ? (
              <>
                <label className="text-xs font-medium text-muted-foreground">เปลี่ยนเป็น</label>
                <Select onValueChange={(v) => updateStatus.mutate(v)}>
                  <SelectTrigger><SelectValue placeholder="เลือกสถานะถัดไป" /></SelectTrigger>
                  <SelectContent>{nextOptions.map((s) => <SelectItem key={s} value={s}>{LABELS[s]}</SelectItem>)}</SelectContent>
                </Select>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">อยู่ในสถานะสิ้นสุดแล้ว</p>
            )}
            <div className="pt-3 border-t text-xs text-muted-foreground space-y-1">
              <div>สร้าง: {fmtDate(p.created_at)}</div>
              <div>อัปเดต: {fmtDate(p.updated_at)}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ icon: Icon, label, value, multiline }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; multiline?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">{Icon && <Icon className="h-3 w-3" />}{label}</div>
      <div className={`mt-1 text-sm ${multiline ? "whitespace-pre-wrap" : ""}`}>{value || "-"}</div>
    </div>
  );
}
