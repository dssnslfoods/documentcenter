import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Calendar, Building2, FolderKanban } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabase } from "@/lib/supabase";
import { fmtDate, fmtCurrency } from "@/lib/format";
import { QuotationStatusBadge } from "@/components/status-badge";

export const Route = createFileRoute("/_authenticated/quotations/$id")({
  head: () => ({ meta: [{ title: "รายละเอียดใบเสนอราคา | Document Hub" }] }),
  component: QuotationDetail,
});

const NEXT_STATUS: Record<string, string[]> = {
  draft: ["submitted", "expired"],
  submitted: ["under_review", "rejected"],
  under_review: ["negotiation", "approved", "rejected"],
  negotiation: ["approved", "rejected", "lost"],
  approved: ["won", "converted_to_contract", "converted_to_po"],
  won: ["converted_to_contract", "converted_to_po"],
  rejected: [],
  lost: [],
  expired: [],
  converted_to_contract: [],
  converted_to_po: [],
};

const LABELS: Record<string, string> = {
  draft: "ร่าง", submitted: "ยื่นแล้ว", under_review: "กำลังตรวจ", negotiation: "เจรจา",
  approved: "อนุมัติ", rejected: "ปฏิเสธ", won: "ชนะงาน", lost: "แพ้งาน",
  expired: "หมดอายุ", converted_to_contract: "แปลงเป็นสัญญา", converted_to_po: "แปลงเป็น PO",
};

function QuotationDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: q, isLoading } = useQuery({
    queryKey: ["quotation", id],
    queryFn: async () => {
      const { data, error } = await getSupabase().from("quotations")
        .select("*, partners(name), departments(name_th), projects(id, code, name)").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await getSupabase().from("quotations").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotation", id] });
      qc.invalidateQueries({ queryKey: ["quotations"] });
      toast.success("อัปเดตสถานะสำเร็จ");
    },
    onError: (e: Error) => toast.error("อัปเดตไม่สำเร็จ", { description: e.message }),
  });

  if (isLoading) return <div className="p-6"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!q) return <div className="p-6">ไม่พบใบเสนอราคา</div>;

  const nextOptions = NEXT_STATUS[q.status] ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/quotations" })}>
          <ArrowLeft className="mr-1 h-4 w-4" />กลับ
        </Button>
      </div>
      <PageHeader title={q.title} description={<span className="font-mono text-sm">{q.quotation_no}</span>}
        actions={<QuotationStatusBadge status={q.status} />} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>ข้อมูลใบเสนอราคา</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="ประเภท" value={q.type === "incoming" ? "ขาเข้า" : "ขาออก"} />
            <Field icon={Building2} label="คู่ค้า" value={(q.partners as { name?: string } | null)?.name} />
            <Field label="แผนก" value={(q.departments as { name_th?: string } | null)?.name_th} />
            <Field icon={Calendar} label="ออกวันที่" value={fmtDate(q.issue_date)} />
            <Field icon={Calendar} label="หมดอายุ" value={fmtDate(q.expiry_date)} />
            <div className="sm:col-span-2 grid grid-cols-2 gap-4 rounded-lg border p-3 sm:grid-cols-4">
              <Field label="ก่อนภาษี" value={fmtCurrency(q.amount_before_tax, q.currency)} />
              <Field label="ส่วนลด" value={fmtCurrency(q.discount, q.currency)} />
              <Field label="ภาษี" value={fmtCurrency(q.tax, q.currency)} />
              <Field label="รวม" value={<strong>{fmtCurrency(q.total_amount, q.currency)}</strong>} />
            </div>
            {q.description && <div className="sm:col-span-2"><Field label="รายละเอียด" value={q.description} multiline /></div>}
            {q.notes && <div className="sm:col-span-2"><Field label="หมายเหตุ" value={q.notes} multiline /></div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>ขั้นตอน</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">สถานะ: <strong>{LABELS[q.status]}</strong></p>
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
              <div>สร้าง: {fmtDate(q.created_at)}</div>
              <div>อัปเดต: {fmtDate(q.updated_at)}</div>
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
