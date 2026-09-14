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
import { fmtDate, fmtCurrency } from "@/lib/format";

type Status = "pending" | "completed" | "postponed" | "failed";
type PayType = "percentage" | "fixed_amount";

const STATUS_META: Record<Status, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  pending:   { label: "รอดำเนินการ", icon: Clock,        tone: "bg-muted text-foreground" },
  completed: { label: "เสร็จสิ้น",    icon: CheckCircle2, tone: "bg-success/15 text-success" },
  postponed: { label: "เลื่อน",        icon: CircleDot,    tone: "bg-warning/15 text-warning" },
  failed:    { label: "ไม่สำเร็จ",     icon: XCircle,      tone: "bg-destructive/10 text-destructive" },
};

type Row = {
  id: string;
  milestone_number: number;
  description: string;
  due_date: string | null;
  payment_type: PayType;
  payment_value: number;
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
    queryKey: ["milestones", projectId],
    queryFn: async () => {
      const { data, error } = await sb
        .from("project_milestones")
        .select("*")
        .eq("project_id", projectId)
        .order("milestone_number");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("project_milestones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ลบเรียบร้อย");
      qc.invalidateQueries({ queryKey: ["milestones", projectId] });
      qc.invalidateQueries({ queryKey: ["project-signals", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, reason, postponedTo }: { id: string; status: Status; reason?: string; postponedTo?: string }) => {
      const patch: Record<string, unknown> = { status, status_reason: reason ?? null };
      if (status === "completed") patch.actual_completion_date = new Date().toISOString().slice(0, 10);
      if (status === "postponed" && postponedTo) patch.postponed_to_date = postponedTo;
      const { error } = await sb.from("project_milestones").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("อัปเดตสถานะแล้ว");
      qc.invalidateQueries({ queryKey: ["milestones", projectId] });
      qc.invalidateQueries({ queryKey: ["project-signals", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const paidAmount = (r: Row) => {
    if (r.payment_type === "fixed_amount") return r.payment_value;
    if (contractValue) return (contractValue * r.payment_value) / 100;
    return 0;
  };

  const totalPaid = (rows ?? []).filter((r) => r.status === "completed").reduce((s, r) => s + paidAmount(r), 0);
  const completedCount = (rows ?? []).filter((r) => r.status === "completed").length;

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
              nextNumber={(rows?.length ?? 0) + 1}
              onClose={() => setOpen(false)}
              onSaved={() => {
                setOpen(false);
                qc.invalidateQueries({ queryKey: ["milestones", projectId] });
                qc.invalidateQueries({ queryKey: ["project-signals", projectId] });
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
                        {canSeePayment && (
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
                            onClose={() => setEditing(null)}
                            onSaved={() => {
                              setEditing(null);
                              qc.invalidateQueries({ queryKey: ["milestones", projectId] });
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
  onClose,
  onSaved,
}: {
  projectId: string;
  nextNumber: number;
  row?: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const sb = getSupabase();
  const isEdit = !!row;
  const [description, setDescription] = useState(row?.description ?? "");
  const [dueDate, setDueDate] = useState(row?.due_date ?? "");
  const [payType, setPayType] = useState<PayType>(row?.payment_type ?? "percentage");
  const [payValue, setPayValue] = useState(row ? String(row.payment_value ?? "") : "");
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [deliverable, setDeliverable] = useState(row?.deliverable_details ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!description) return toast.error("กรุณาระบุรายละเอียดงวด");
    setSaving(true);
    try {
      const payload = {
        description,
        due_date: dueDate || null,
        payment_type: payType,
        payment_value: payValue ? Number(payValue) : 0,
        deliverable_details: deliverable || null,
        notes: notes || null,
      };
      const { error } = isEdit
        ? await sb.from("project_milestones").update(payload).eq("id", row!.id)
        : await sb.from("project_milestones").insert({
            project_id: projectId,
            milestone_number: nextNumber,
            ...payload,
          });
      if (error) throw error;
      toast.success(isEdit ? "แก้ไขเรียบร้อย" : "เพิ่มงวดเรียบร้อย");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

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
            <Input type="number" value={payValue} onChange={(e) => setPayValue(e.target.value)} placeholder={payType === "percentage" ? "30" : "500000"} />
          </div>
        </div>
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

