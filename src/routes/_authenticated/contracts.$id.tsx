import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Calendar, DollarSign, Building2, Truck, Receipt } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { getSupabase } from "@/lib/supabase";
import { fmtDate, fmtCurrency } from "@/lib/format";
import { ContractStatusBadge } from "@/components/status-badge";
import type { ContractStatus } from "@/lib/types";

type Milestone = { id: string; kind: string; name: string; due_date: string | null; amount: number | null; status: string | null; notes: string | null; sort_order: number };

export const Route = createFileRoute("/_authenticated/contracts/$id")({
  head: () => ({ meta: [{ title: "รายละเอียดสัญญา | Document Hub" }] }),
  component: ContractDetail,
});

const NEXT_STATUS: Record<ContractStatus, ContractStatus[]> = {
  draft: ["under_review", "archived"],
  under_review: ["pending_approval", "draft"],
  pending_approval: ["pending_signature", "under_review"],
  pending_signature: ["active", "pending_approval"],
  active: ["near_expiry", "renewal_in_progress", "terminated", "expired"],
  near_expiry: ["renewal_in_progress", "expired", "terminated"],
  renewal_in_progress: ["active", "expired"],
  expired: ["archived", "renewal_in_progress"],
  terminated: ["archived"],
  archived: [],
};

const STATUS_LABEL: Record<ContractStatus, string> = {
  draft: "ร่าง", under_review: "กำลังตรวจ", pending_approval: "รออนุมัติ", pending_signature: "รอลงนาม",
  active: "มีผลบังคับใช้", near_expiry: "ใกล้หมดอายุ", renewal_in_progress: "กำลังต่ออายุ",
  expired: "หมดอายุ", terminated: "ยกเลิก", archived: "จัดเก็บ",
};

function ContractDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: c, isLoading } = useQuery({
    queryKey: ["contract", id],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("contracts")
        .select("*, partners(name, email), departments(name_th)")
        .eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: milestones } = useQuery({
    queryKey: ["contract-milestones", id],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("contract_milestones")
        .select("*")
        .eq("contract_id", id)
        .order("kind")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Milestone[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (status: ContractStatus) => {
      const { error } = await getSupabase().from("contracts").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract", id] });
      qc.invalidateQueries({ queryKey: ["contracts"] });
      toast.success("อัปเดตสถานะสำเร็จ");
    },
    onError: (e: Error) => toast.error("อัปเดตไม่สำเร็จ", { description: e.message }),
  });

  if (isLoading) return <div className="p-6"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!c) return <div className="p-6">ไม่พบสัญญา</div>;

  const nextOptions = NEXT_STATUS[c.status as ContractStatus] ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/contracts" })}>
          <ArrowLeft className="mr-1 h-4 w-4" />กลับ
        </Button>
      </div>
      <PageHeader
        title={c.title}
        description={<span className="font-mono text-sm">{c.contract_no}</span>}
        actions={<ContractStatusBadge status={c.status as ContractStatus} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>ข้อมูลสัญญา</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field icon={Building2} label="คู่สัญญา" value={(c.partners as { name?: string } | null)?.name} />
            <Field icon={Building2} label="แผนก" value={(c.departments as { name_th?: string } | null)?.name_th} />
            <Field label="ประเภท" value={c.contract_type} />
            <Field label="วันลงนาม" value={fmtDate(c.sign_date)} />
            <Field icon={Calendar} label="เริ่มมีผล" value={fmtDate(c.start_date)} />
            <Field icon={Calendar} label="สิ้นสุด" value={fmtDate(c.end_date)} />
            <Field icon={DollarSign} label="มูลค่า" value={fmtCurrency(c.value_amount, c.currency ?? "THB")} />
            <Field label="แจ้งเตือนล่วงหน้า" value={c.notice_days ? `${c.notice_days} วัน` : "-"} />
            <Field label="ต่ออายุอัตโนมัติ" value={c.auto_renewal ? "ใช่" : "ไม่ใช่"} />
            {c.payment_terms && <div className="sm:col-span-2"><Field label="เงื่อนไขการชำระเงิน" value={c.payment_terms} multiline /></div>}
            {c.key_terms && <div className="sm:col-span-2"><Field label="เงื่อนไขสำคัญ" value={c.key_terms} multiline /></div>}
            {c.notes && <div className="sm:col-span-2"><Field label="หมายเหตุ" value={c.notes} multiline /></div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>ขั้นตอนการทำงาน</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">สถานะปัจจุบัน: <strong>{STATUS_LABEL[c.status as ContractStatus]}</strong></p>
            {nextOptions.length > 0 ? (
              <>
                <label className="text-xs font-medium text-muted-foreground">เปลี่ยนเป็น</label>
                <Select onValueChange={(v) => updateStatus.mutate(v as ContractStatus)}>
                  <SelectTrigger><SelectValue placeholder="เลือกสถานะถัดไป" /></SelectTrigger>
                  <SelectContent>
                    {nextOptions.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">สัญญานี้อยู่ในสถานะสิ้นสุดแล้ว</p>
            )}
            <div className="pt-3 border-t text-xs text-muted-foreground space-y-1">
              <div>สร้างเมื่อ: {fmtDate(c.created_at)}</div>
              <div>อัปเดต: {fmtDate(c.updated_at)}</div>
            </div>
            {c.document_id && (
              <Button variant="outline" size="sm" asChild className="w-full">
                <Link to="/documents/$id" params={{ id: c.document_id }}>ดูเอกสารแนบ</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ icon: Icon, label, value, multiline }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; multiline?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}{label}
      </div>
      <div className={`mt-1 text-sm ${multiline ? "whitespace-pre-wrap" : ""}`}>{value || "-"}</div>
    </div>
  );
}
