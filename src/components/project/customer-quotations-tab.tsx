import { useState, type ChangeEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Download, Plus, Loader2, FileSpreadsheet, Star, CheckCircle2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/page-header";
import { getSupabase } from "@/lib/supabase";
import { fmtDate, fmtCurrency } from "@/lib/format";
import { uploadProjectFile, getProjectFileUrl } from "@/lib/project-files";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVatRates, calcVat, pickVatRate, fmtNum } from "@/lib/vat";
import { syncContractValueFromFinalQuotation } from "@/lib/contract-value";
import { AlertTriangle } from "lucide-react";
import { FilePreviewButton } from "@/components/project/file-preview-dialog";
import { ScanQuotationCard } from "@/components/scan-quotation-card";


type Row = {
  id: string;
  title: string | null;
  quotation_amount: number | null;
  submitted_date: string | null;
  notes: string | null;
  file_url: string | null;
  is_final: boolean;
  vat_rate: number | null;
  vat_amount: number | null;
  amount_incl_vat: number | null;
};

export function CustomerQuotationsTab({
  projectId,
  canEdit = true,
  canSeePrice = true,
}: {
  projectId: string;
  canEdit?: boolean;
  canSeePrice?: boolean;
}) {
  const sb = getSupabase();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["customer-quotations", projectId],
    queryFn: async () => {
      const { data, error } = await sb
        .from("customer_quotations")
        .select("id, title, quotation_amount, submitted_date, notes, file_url, is_final, vat_rate, vat_amount, amount_incl_vat")
        .eq("project_id", projectId)
        .order("submitted_date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const afterChange = async () => {
    try {
      await syncContractValueFromFinalQuotation(projectId);
    } catch {
      /* keep the UI responsive even if the project row is not writable */
    }
    qc.invalidateQueries({ queryKey: ["customer-quotations", projectId] });
    qc.invalidateQueries({ queryKey: ["customer-quotation-final", projectId] });
    qc.invalidateQueries({ queryKey: ["project", projectId], refetchType: "all" });
    qc.invalidateQueries({ queryKey: ["projects"], refetchType: "all" });
    qc.invalidateQueries({ queryKey: ["final-quotation", projectId] });
  };

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("customer_quotations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("ลบเรียบร้อย");
      await afterChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ใบเสนอราคาให้ลูกค้าเลือกเป็น Final ได้มากกว่า 1 ใบ (เหมือนฝั่ง Supplier)
  const toggleFinal = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: boolean }) => {
      const { error } = await sb.from("customer_quotations").update({ is_final: next }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_d, v) => {
      toast.success(
        v.next
          ? "เพิ่มเป็น Final แล้ว — อัปเดตมูลค่าสัญญาของโครงการให้อัตโนมัติ"
          : "ยกเลิก Final แล้ว — อัปเดตมูลค่าสัญญาให้อัตโนมัติ",
      );
      await afterChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const openFile = async (path: string) => {
    const url = await getProjectFileUrl(path);
    if (url) window.open(url, "_blank");
  };

  const finalRows = (rows ?? []).filter((r) => r.is_final);
  const finalTotal = finalRows.reduce((s, r) => s + Number(r.quotation_amount ?? 0), 0);

  return (
    <div className="space-y-4">
      {!isLoading && rows && rows.length > 0 && finalRows.length === 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <div className="font-medium">ใบเสนอราคาลูกค้ายังไม่ตกลง (ยังไม่มีฉบับ Final)</div>
            <p className="text-xs text-muted-foreground">
              มูลค่าสัญญาของโครงการจะถูกดึงจากใบเสนอราคาที่เป็น Final เท่านั้น (เลือกได้มากกว่า 1 ใบ) —
              กดปุ่ม "เลือกเป็น Final" ในใบที่ลูกค้าตกลง
            </p>
          </div>
        </div>
      )}

      {finalRows.length > 0 && (
        <div className="tile space-y-2 border-success/40 bg-success/5 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <div className="text-[10px] font-semibold uppercase tracking-widest text-success">
              Final · เลือกไว้ {finalRows.length} รายการ
            </div>
          </div>
          <div className="space-y-1">
            {finalRows.map((s) => (
              <div key={s.id} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{s.title || "ใบเสนอราคา (ไม่ได้ระบุหัวข้องาน)"}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{fmtDate(s.submitted_date)}</span>
                </span>
                {canSeePrice && (
                  <span className="font-semibold tabular-nums">{fmtCurrency(s.quotation_amount, "THB")}</span>
                )}
              </div>
            ))}
          </div>
          {canSeePrice && finalRows.length > 1 && (
            <div className="flex justify-between border-t border-success/30 pt-2 text-sm font-semibold">
              <span>รวม Final ทั้งหมด (= มูลค่าสัญญา)</span>
              <span className="tabular-nums">{fmtCurrency(finalTotal, "THB")}</span>
            </div>
          )}
        </div>
      )}

      {canEdit && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-2 h-4 w-4" />เพิ่ม Version</Button>
            </DialogTrigger>
            <AddDialog
              projectId={projectId}
              onClose={() => setOpen(false)}
              onSaved={async () => {
                setOpen(false);
                await afterChange();
              }}
            />
          </Dialog>
        </div>
      )}


      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">กำลังโหลด...</div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState icon={FileSpreadsheet} title="ยังไม่มีใบเสนอราคาที่ส่งให้ลูกค้า" description="เพิ่มแต่ละ Version พร้อมยอดเงินและไฟล์ หรือสแกนเอกสารให้ AI กรอกให้" />
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <Card key={r.id} className={r.is_final ? "ring-2 ring-success" : ""}>
              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  {r.is_final ? <Star className="h-5 w-5 fill-current" /> : `#${rows.length - i}`}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.title || `Version ${rows.length - i}`}</span>
                    {r.is_final && <Badge className="bg-success/15 text-success">Final</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Version {rows.length - i} · ส่งเมื่อ {fmtDate(r.submitted_date)}
                  </div>
                  {r.notes && <p className="mt-1 text-sm">{r.notes}</p>}
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold tabular-nums">
                    {canSeePrice ? fmtCurrency(r.quotation_amount, "THB") : "฿ ••••••"}
                  </div>
                  {canSeePrice && (
                    <div className="text-xs text-muted-foreground tabular-nums">
                      ก่อน VAT · VAT {Number(r.vat_rate ?? 0).toFixed(2)}% ={" "}
                      {fmtCurrency(r.amount_incl_vat ?? r.quotation_amount, "THB")} (สุทธิ)
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  {r.file_url && (
                    <>
                      <FilePreviewButton path={r.file_url} label="ดูใบเสนอราคา" />
                      <Button size="sm" variant="outline" onClick={() => openFile(r.file_url!)} title="ดาวน์โหลด">
                        <Download className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {canEdit && (
                    <Button
                      size="sm"
                      variant={r.is_final ? "secondary" : "outline"}
                      onClick={() => toggleFinal.mutate({ id: r.id, next: !r.is_final })}
                      disabled={toggleFinal.isPending}
                    >
                      <Star className={`mr-1 h-3.5 w-3.5 ${r.is_final ? "fill-current text-success" : ""}`} />
                      {r.is_final ? "ยกเลิก Final" : "เลือกเป็น Final"}
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => confirm("ลบ Version นี้?") && remove.mutate(r.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AddDialog({
  projectId,
  onClose,
  onSaved,
}: {
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const sb = getSupabase();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [isFinal, setIsFinal] = useState(false);
  const [vatRateId, setVatRateId] = useState<string | undefined>(undefined);
  const { data: vatRates } = useVatRates();
  const selectedVat = pickVatRate(vatRates, vatRateId);
  const { pct, vatAmount, total } = calcVat(Number(amount) || 0, selectedVat ? Number(selectedVat.rate) : 0);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      let path: string | null = null;
      if (file) path = await uploadProjectFile(projectId, file);
      const { error } = await sb.from("customer_quotations").insert({
        project_id: projectId,
        title: title || null,
        quotation_amount: amount ? Number(amount) : null,
        vat_rate: selectedVat ? Number(selectedVat.rate) : 0,
        vat_amount: amount ? vatAmount : null,
        amount_incl_vat: amount ? total : null,
        submitted_date: date || null,
        notes: notes || null,
        file_url: path,
        is_final: isFinal,
      });
      if (error) throw error;
      toast.success("บันทึกเรียบร้อย");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
      <DialogHeader><DialogTitle>เพิ่มใบเสนอราคาให้ลูกค้า</DialogTitle></DialogHeader>
      <div className="-mx-1 flex-1 space-y-3 overflow-y-auto px-1">
        <ScanQuotationCard
          onFile={(f) => setFile(f)}
          onScanned={(d) => {
            if (d.amount_before_tax != null) setAmount(String(d.amount_before_tax));
            if (d.issue_date) setDate(d.issue_date);
            const noteParts = [d.quotation_no ? `เลขที่ ${d.quotation_no}` : null, d.description].filter(Boolean);
            if (noteParts.length) setNotes(noteParts.join(" · "));
            const guess = d.title || d.description || d.items?.find((it) => it.description)?.description || "";
            if (guess) setTitle(String(guess).slice(0, 120));
          }}
        />

        <div>
          <Label>หัวข้องาน / ชื่อรายการ</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น งานผลิตกล่องของขวัญ Premium Gift"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>ยอดเสนอก่อน VAT (บาท)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>วันที่ส่ง</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>อัตรา VAT</Label>
            <Select value={vatRateId ?? selectedVat?.id ?? "none"} onValueChange={setVatRateId}>
              <SelectTrigger><SelectValue placeholder="ไม่คิด VAT" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">ไม่คิด VAT (0%)</SelectItem>
                {(vatRates ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.label} ({Number(v.rate).toFixed(2)}%)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">ก่อน VAT</span><span className="tabular-nums">{fmtNum(Number(amount) || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">VAT {pct.toFixed(2)}%</span><span className="tabular-nums">{fmtNum(vatAmount)}</span></div>
            <div className="mt-1 flex justify-between border-t pt-1 font-semibold"><span>ยอดสุทธิ</span><span className="tabular-nums">{fmtNum(total)}</span></div>
          </div>
        </div>
        <div>
          <Label>หมายเหตุ / เหตุผลการปรับ</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <div>
          <Label>ไฟล์แนบ (PDF)</Label>
          <Input type="file" onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)} />
          {file && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              จะจัดเก็บไฟล์: <span className="font-medium text-foreground">{file.name}</span>
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)} />
          กำหนดเป็น Final (เลือกได้มากกว่า 1 ใบ)
        </label>
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
