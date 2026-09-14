import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, Pencil, CircleDot, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/page-header";
import { getSupabase } from "@/lib/supabase";
import { fmtDate, fmtCurrency, toLocalISODate } from "@/lib/format";
import { fetchMilestonePayments } from "@/lib/project-financials";

type Status = "pending" | "completed" | "postponed" | "failed";
type PayType = "percentage" | "fixed_amount";

const STATUS_META: Record<Status, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  pending:   { label: "รอดำเนินการ", icon: Clock,        tone: "bg-muted text-foreground" },
  completed: { label: "เสร็จสิ้น",    icon: CheckCircle2, tone: "bg-success/15 text-success" },
  postponed: { label: "เลื่อน",        icon: CircleDot,    tone: "bg-warning/15 text-warning" },
  failed:    { label: "ไม่สำเร็จ",     icon: XCircle,      tone: "bg-destructive/10 text-destructive" },
};

// payment_value ไม่ถูก select ตรง (db/0058) — เติมจาก RPC เฉพาะผู้มีสิทธิ์เห็นเงิน
const MILESTONE_COLUMNS =
  "id, milestone_number, description, due_date, payment_type, status, actual_completion_date, postponed_to_date, status_reason, notes, deliverable_details";

type Row = {
  id: string;
  milestone_number: number;
  description: string;
  due_date: string | null;
  payment_type: PayType;
  payment_value: number | null;
  status: Status;
  actual_completion_date: string | null;
  postponed_to_date: string | null;
  status_reason: string | null;
  notes: string | null;
  deliverable_details: string | null;
};

export function MilestonesTab({
  projectId,
  contractValue,
  canEdit = true,
  canSeePayment = true,
}: {
  projectId: string;
  contractValue: number | null;
  canEdit?: boolean;
  canSeePayment?: boolean;
}) {
  const sb = getSupabase();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["milestones", projectId, canSeePayment],
    queryFn: async () => {
      const { data, error } = await sb
        .from("project_milestones")
        .select(MILESTONE_COLUMNS)
        .eq("project_id", projectId)
        .order("milestone_number");
      if (error) throw error;
      const payments = canSeePayment ? await fetchMilestonePayments(projectId) : new Map<string, number>();
      return ((data ?? []) as Omit<Row, "payment_value">[]).map((r) => ({ ...r, payment_value: payments.get(r.id) ?? null }));
    },
  });

  const afterChange = () => {
    qc.invalidateQueries({ queryKey: ["milestones", projectId] });
    qc.invalidateQueries({ queryKey: ["project-signals", projectId] });
  };

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await sb.from("project_milestones").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("คุณไม่มีสิทธิ์ลบงวดงานนี้");
    },
    onSuccess: () => {
      toast.success("ลบเรียบร้อย");
      afterChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, reason, postponedTo }: { id: string; status: Status; reason?: string; postponedTo?: string }) => {
      // ล้างวันที่ของสถานะเดิม เพื่อไม่ให้ "เสร็จจริง" / "เลื่อนเป็น" ค้างเมื่อเปลี่ยนสถานะ
      const patch: Record<string, unknown> = {
        status,
        status_reason: reason ?? null,
        actual_completion_date: status === "completed" ? toLocalISODate() : null,
        postponed_to_date: status === "postponed" ? postponedTo ?? null : null,
      };
      const { data, error } = await sb.from("project_milestones").update(patch).eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("คุณไม่มีสิทธิ์แก้ไขงวดงานนี้");
    },
    onSuccess: () => {
      toast.success("อัปเดตสถานะแล้ว");
      afterChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const paidAmount = (r: Row) => {
    if (r.payment_value == null) return 0;
    if (r.payment_type === "fixed_amount") return r.payment_value;
    if (contractValue) return (contractValue * r.payment_value) / 100;
    return 0;
  };

  const totalPaid = (rows ?? []).filter((r) => r.status === "completed").reduce((s, r) => s + paidAmount(r), 0);
  const completedCount = (rows ?? []).filter((r) => r.status === "completed").length;
  // เลขงวดถัดไปต่อจากเลขสูงสุด (ลบงวดกลางแล้วเพิ่มใหม่จะไม่ได้เลขซ้ำ)
  const nextNumber = (rows ?? []).reduce((m, r) => Math.max(m, r.milestone_number), 0) + 1;

  return (
    <div className="space-y-4">
      {canSeePayment && rows && rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label="งวดทั้งหมด" value={`${rows.length}`} />
          <SummaryCard label="เสร็จสิ้น" value={`${completedCount}`} tone="text-success" />
          <SummaryCard label="ยอดชำระสะสม" value={fmtCurrency(totalPaid, "THB")} tone="text-primary" />
        </div>
      )}

      {canEdit && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-2 h-4 w-4" />เพิ่มงวด</Button>
            </DialogTrigger>
            <MilestoneDialog
              projectId={projectId}
              nextNumber={nextNumber}
              otherRows={rows ?? []}
              canSeePayment={canSeePayment}
              contractValue={contractValue}
              onClose={() => setOpen(false)}
              onSaved={() => {
                setOpen(false);
                afterChange();
              }}
            />
          </Dialog>
        </div>
      )}

      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">กำลังโหลด...</div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState icon={CircleDot} title="ยังไม่มีงวดงาน" description="กำหนดงวดงาน / งวดจ่ายเงินตามสัญญา" />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const meta = STATUS_META[r.status];
            const Icon = meta.icon;
            return (
              <Card key={r.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                      {r.milestone_number}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{r.description}</span>
                        <Badge className={meta.tone}>
                          <Icon className="mr-1 h-3 w-3" />{meta.label}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span>กำหนด: {fmtDate(r.due_date)}</span>
                        {r.actual_completion_date && <span>เสร็จจริง: {fmtDate(r.actual_completion_date)}</span>}
                        {r.postponed_to_date && <span>เลื่อนเป็น: {fmtDate(r.postponed_to_date)}</span>}
                        {canSeePayment && r.payment_value != null && (
                          <span>
                            จ่าย: {r.payment_type === "percentage" ? `${r.payment_value}% (${fmtCurrency(paidAmount(r), "THB")})` : fmtCurrency(r.payment_value, "THB")}
                          </span>
                        )}
                      </div>
                      {r.status_reason && <p className="mt-1 text-xs italic text-muted-foreground">เหตุผล: {r.status_reason}</p>}
                      {r.deliverable_details && <p className="mt-1 text-xs text-muted-foreground">ส่งมอบ: {r.deliverable_details}</p>}
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-2">
                        <Select
                          value={r.status}
                          onValueChange={(v) => {
                            const nv = v as Status;
                            if (nv === "postponed") {
                              const d = prompt("เลื่อนไปวันที่ (YYYY-MM-DD)");
                              if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
                                toast.error("รูปแบบวันที่ต้องเป็น YYYY-MM-DD");
                                return;
                              }
                              const reason = prompt("เหตุผลการเลื่อน") ?? "";
                              if (d) updateStatus.mutate({ id: r.id, status: nv, reason, postponedTo: d });
                            } else if (nv === "failed") {
                              const reason = prompt("เหตุผลที่ไม่สำเร็จ") ?? "";
                              updateStatus.mutate({ id: r.id, status: nv, reason });
                            } else {
                              updateStatus.mutate({ id: r.id, status: nv });
                            }
                          }}
                        >
                          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(STATUS_META) as Status[]).map((s) => (
                              <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Dialog
                          open={editing === r.id}
                          onOpenChange={(o) => setEditing(o ? r.id : null)}
                        >
                          <DialogTrigger asChild>
                            <Button size="sm" variant="ghost" title="แก้ไขงวด">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <MilestoneDialog
                            projectId={projectId}
                            nextNumber={r.milestone_number}
                            row={r}
                            otherRows={(rows ?? []).filter((x) => x.id !== r.id)}
                            canSeePayment={canSeePayment}
                            contractValue={contractValue}
                            onClose={() => setEditing(null)}
                            onSaved={() => {
                              setEditing(null);
                              afterChange();
                            }}
                          />
                        </Dialog>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => confirm("ลบงวดนี้?") && remove.mutate(r.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>

                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-xl font-semibold tabular-nums ${tone ?? ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function MilestoneDialog({
  projectId,
  nextNumber,
  row,
  otherRows,
  canSeePayment,
  contractValue,
  onClose,
  onSaved,
}: {
  projectId: string;
  nextNumber: number;
  row?: Row;
  otherRows: Row[];
  canSeePayment: boolean;
  contractValue: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const sb = getSupabase();
  const isEdit = !!row;
  const [description, setDescription] = useState(row?.description ?? "");
  const [dueDate, setDueDate] = useState(row?.due_date ?? "");
  const [payType, setPayType] = useState<PayType>(row?.payment_type ?? "percentage");
  const [payValue, setPayValue] = useState(row?.payment_value != null ? String(row.payment_value) : "");
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [deliverable, setDeliverable] = useState(row?.deliverable_details ?? "");
  const [saving, setSaving] = useState(false);

  const otherPercent = otherRows
    .filter((r) => r.payment_type === "percentage")
    .reduce((s, r) => s + (r.payment_value ?? 0), 0);
  const otherFixed = otherRows
    .filter((r) => r.payment_type === "fixed_amount")
    .reduce((s, r) => s + (r.payment_value ?? 0), 0);

  const validatePayment = (value: number): string | null => {
    if (!Number.isFinite(value) || value < 0) return "ค่าการจ่ายต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป";
    if (payType === "percentage") {
      if (value > 100) return "เปอร์เซ็นต์ต้องไม่เกิน 100";
      if (otherPercent + value > 100) {
        return `รวมเปอร์เซ็นต์ทุกงวดเกิน 100% (งวดอื่นรวม ${otherPercent}% + งวดนี้ ${value}%)`;
      }
    }
    return null;
  };

  const submit = async () => {
    if (!description) return toast.error("กรุณาระบุรายละเอียดงวด");
    const value = payValue ? Number(payValue) : 0;
    if (canSeePayment) {
      const err = validatePayment(value);
      if (err) return toast.error(err);
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        description,
        due_date: dueDate || null,
        deliverable_details: deliverable || null,
        notes: notes || null,
        // ผู้ที่ไม่เห็นยอดเงิน: ไม่แตะค่าการจ่ายเดิม
        ...(canSeePayment ? { payment_type: payType, payment_value: value } : {}),
      };
      const res = isEdit
        ? await sb.from("project_milestones").update(payload).eq("id", row!.id).select("id")
        : await sb.from("project_milestones").insert({ project_id: projectId, milestone_number: nextNumber, ...payload }).select("id");
      if (res.error) throw res.error;
      if (!res.data?.length) throw new Error("คุณไม่มีสิทธิ์บันทึกงวดงานนี้");
      toast.success(isEdit ? "แก้ไขเรียบร้อย" : "เพิ่มงวดเรียบร้อย");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const fixedPreview = payType === "fixed_amount" && payValue ? otherFixed + Number(payValue) : null;

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {isEdit ? `แก้ไขงวดงาน #${row!.milestone_number}` : `เพิ่มงวดงาน #${nextNumber}`}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>รายละเอียดงวด <span className="text-destructive">*</span></Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="เช่น งวดที่ 1: ติดตั้งอุปกรณ์" />
        </div>
        {canSeePayment && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>ประเภทการจ่าย</Label>
              <Select value={payType} onValueChange={(v) => setPayType(v as PayType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">เปอร์เซ็นต์ (%)</SelectItem>
                  <SelectItem value="fixed_amount">จำนวนคงที่ (บาท)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ค่า</Label>
              <Input
                type="number"
                min="0"
                max={payType === "percentage" ? 100 : undefined}
                value={payValue}
                onChange={(e) => setPayValue(e.target.value)}
                placeholder={payType === "percentage" ? "30" : "500000"}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {payType === "percentage"
                  ? `งวดอื่นรวม ${otherPercent}% · คงเหลือ ${Math.max(0, 100 - otherPercent)}%`
                  : contractValue && fixedPreview != null && fixedPreview > contractValue
                    ? `ยอดคงที่รวม ${fmtCurrency(fixedPreview, "THB")} เกินมูลค่าสัญญา ${fmtCurrency(contractValue, "THB")}`
                    : null}
              </p>
            </div>
          </div>
        )}
        <div>
          <Label>วันที่กำหนด</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <Label>รายละเอียดการส่งมอบ</Label>
          <Textarea
            value={deliverable}
            onChange={(e) => setDeliverable(e.target.value)}
            rows={3}
            placeholder="เช่น ส่งมอบไฟล์ต้นฉบับ Artwork, รายงานสรุป, อุปกรณ์ติดตั้ง ฯลฯ"
          />
        </div>
        <div>
          <Label>หมายเหตุ</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
        <Button onClick={submit} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}บันทึก
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
