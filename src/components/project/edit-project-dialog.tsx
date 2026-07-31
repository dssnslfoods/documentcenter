import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Info, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSupabase } from "@/lib/supabase";
import { PartnerFormDialog, usePartners } from "@/components/partner-form-dialog";
import { useAuth } from "@/hooks/use-supabase";
import { fetchFinalQuotationSummary } from "@/lib/contract-value";

export type EditableProject = {
  id: string;
  name: string;
  description: string | null;
  customer_name: string | null;
  customer_id?: string | null;
  project_type: string | null;
  start_date: string | null;
  end_date: string | null;
  contract_value: number | null;
  vat_rate?: number | null;
  is_inhouse?: boolean | null;
};

export function EditProjectDialog({
  project,
  open,
  onOpenChange,
  canEditPrice = true,
}: {
  project: EditableProject;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** When false, price/VAT fields are hidden and left untouched on save. */
  canEditPrice?: boolean;
}) {
  const sb = getSupabase();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: customers } = usePartners("customer");
  const [partnerOpen, setPartnerOpen] = useState(false);

  const { data: workTypes } = useQuery({
    queryKey: ["work-types"],
    queryFn: async () =>
      (await sb.from("work_types").select("id, code, name_th").eq("is_active", true).order("sort_order").order("name_th")).data ?? [],
  });
  const { data: finalQuote } = useQuery({
    queryKey: ["final-quotation", project.id],
    enabled: open && canEditPrice,
    queryFn: () => fetchFinalQuotationSummary(project.id),
  });

  const [name, setName] = useState(project.name ?? "");
  const [description, setDescription] = useState(project.description ?? "");
  const [customerId, setCustomerId] = useState(project.customer_id ?? "");
  const [customerName, setCustomerName] = useState(project.customer_name ?? "");
  const [projectType, setProjectType] = useState(project.project_type ?? "");
  const [startDate, setStartDate] = useState(project.start_date ?? "");
  const [endDate, setEndDate] = useState(project.end_date ?? "");
  const [isInhouse, setIsInhouse] = useState(!!project.is_inhouse);

  // Re-sync the form only when the dialog opens (or switches project).
  // Depending on the whole `project` object would reset the user's typing on any
  // background refetch of the project query.
  const syncKey = `${open ? "1" : "0"}:${project.id}`;
  const lastSync = useRef<string | null>(null);
  useEffect(() => {
    if (!open) return;
    if (lastSync.current === syncKey) return;
    lastSync.current = syncKey;
    setName(project.name ?? "");
    setDescription(project.description ?? "");
    setCustomerId(project.customer_id ?? "");
    setCustomerName(project.customer_name ?? "");
    setProjectType(project.project_type ?? "");
    setStartDate(project.start_date ?? "");
    setEndDate(project.end_date ?? "");
    setIsInhouse(!!project.is_inhouse);
  }, [open, syncKey, project]);

  // Contract value is derived from the FINAL customer quotation — never typed here.
  const net = Number(finalQuote?.final?.quotation_amount ?? 0);
  const vatPercent = Number(finalQuote?.final?.vat_rate ?? 0);
  const vatAmount = Number(finalQuote?.final?.vat_amount ?? Math.round(net * vatPercent) / 100);
  const gross = Number(finalQuote?.final?.amount_incl_vat ?? Math.round((net + vatAmount) * 100) / 100);

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("กรุณากรอกชื่อโครงการ");
      if (startDate && endDate && new Date(endDate) < new Date(startDate))
        throw new Error("วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่ม");
      const patch: Record<string, unknown> = {
        name: name.trim(),
        description: description || null,
        customer_id: customerId || null,
        customer_name: customerName || null,
        project_type: projectType || null,
        start_date: startDate || null,
        end_date: endDate || null,
        is_inhouse: isInhouse,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await sb
        .from("projects")
        .update(patch)
        .eq("id", project.id)
        .select("id");
      if (error) throw error;
      // RLS can silently reject the write (0 rows affected) — surface it instead of
      // showing a success toast with unchanged data.
      if (!data || data.length === 0)
        throw new Error("ไม่สามารถบันทึกได้ — คุณอาจไม่มีสิทธิ์แก้ไขโครงการนี้");
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["project", project.id], refetchType: "all" }),
        qc.invalidateQueries({ queryKey: ["projects"], refetchType: "all" }),
        qc.invalidateQueries({ queryKey: ["project-last-editor"], refetchType: "all" }),
        qc.invalidateQueries({ queryKey: ["project-history", project.id], refetchType: "all" }),
      ]);
      toast.success("บันทึกรายละเอียดโครงการแล้ว");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error("บันทึกไม่สำเร็จ", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>แก้ไขรายละเอียดโครงการ</DialogTitle></DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-2">
            <Label>ชื่อโครงการ *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>ลูกค้า</Label>
            <div className="flex gap-2">
              <Select
                value={customerId || undefined}
                onValueChange={(v) => {
                  setCustomerId(v);
                  setCustomerName((customers ?? []).find((c) => c.id === v)?.name ?? "");
                }}
              >
                <SelectTrigger className="flex-1"><SelectValue placeholder={customerName || "เลือกลูกค้า"} /></SelectTrigger>
                <SelectContent>
                  {(customers ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="mr-2 font-mono text-xs text-muted-foreground">{c.code}</span>{c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="icon" aria-label="เพิ่มลูกค้าใหม่" onClick={() => setPartnerOpen(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <PartnerFormDialog
              open={partnerOpen}
              onOpenChange={setPartnerOpen}
              defaultType="customer"
              onSaved={(row) => { setCustomerId(row.id); setCustomerName(row.name); }}
            />
          </div>

          <div className="space-y-2">
            <Label>ประเภทงาน</Label>
            <Select value={projectType || undefined} onValueChange={setProjectType}>
              <SelectTrigger><SelectValue placeholder="เลือกประเภทงาน" /></SelectTrigger>
              <SelectContent>
                {(workTypes ?? []).map((w: { id: string; name_th: string }) => (
                  <SelectItem key={w.id} value={w.name_th}>{w.name_th}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2"><Label>วันเริ่ม</Label><Input type="date" value={startDate ?? ""} onChange={(e) => setStartDate(e.target.value)} /></div>
          <div className="space-y-2"><Label>วันสิ้นสุด</Label><Input type="date" value={endDate ?? ""} onChange={(e) => setEndDate(e.target.value)} /></div>

          {canEditPrice ? (
            <div className="sm:col-span-2 rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
                มูลค่าสัญญาดึงมาจากใบเสนอราคาลูกค้าฉบับสุดท้าย (Final) โดยอัตโนมัติ — แก้ไขที่แท็บ “ใบเสนอราคาลูกค้า”
              </div>
              {finalQuote?.final ? (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">มูลค่าก่อน VAT</span><span className="tabular-nums">{net.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">VAT {vatPercent.toFixed(2)}%</span><span className="tabular-nums">{vatAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</span></div>
                  <div className="mt-1 flex justify-between border-t pt-1 font-semibold"><span>รวมทั้งสิ้น</span><span className="tabular-nums">{gross.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</span></div>
                </>
              ) : (
                <div className="flex items-start gap-2 text-xs">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                  <span>
                    {finalQuote?.hasQuotations
                      ? "ใบเสนอราคาลูกค้ายังไม่ตกลง (ยังไม่มีฉบับ Final) — ยังไม่มีมูลค่าสัญญา"
                      : "ยังไม่มีใบเสนอราคาลูกค้าในโครงการนี้"}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="sm:col-span-2 rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
              คุณไม่มีสิทธิ์ดู/แก้ไขข้อมูลราคา (มูลค่าสัญญา / VAT) — แก้ไขข้อมูลอื่นได้ตามปกติ
            </div>
          )}


          <div className="sm:col-span-2 flex items-start gap-3 rounded-xl border bg-muted/30 p-3">
            <Checkbox id="edit_is_inhouse" checked={isInhouse} onCheckedChange={(c) => setIsInhouse(c === true)} className="mt-0.5" />
            <div className="space-y-0.5">
              <Label htmlFor="edit_is_inhouse" className="cursor-pointer">งานผลิตภายใน (ไม่ใช้ Supplier / Outsource)</Label>
              <p className="text-xs text-muted-foreground">เมื่อเลือก ระบบจะข้ามขั้นตอน RFQ / Spec และใบเสนอราคา Supplier</p>
            </div>
          </div>

          <div className="sm:col-span-2 space-y-2">
            <Label>รายละเอียด</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
