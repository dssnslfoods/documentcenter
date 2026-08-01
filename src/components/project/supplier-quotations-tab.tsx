import { useState, type ChangeEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Download, Plus, Loader2, Package, CheckCircle2, Star, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/page-header";
import { useVatRates, calcVat, pickVatRate, fmtNum } from "@/lib/vat";
import { getSupabase } from "@/lib/supabase";
import { fmtDate, fmtCurrency } from "@/lib/format";
import { uploadProjectFile, getProjectFileUrl } from "@/lib/project-files";
import { FilePreviewButton } from "@/components/project/file-preview-dialog";
import { PartnerFormDialog, usePartners } from "@/components/partner-form-dialog";
import { ScanQuotationCard } from "@/components/scan-quotation-card";
import type { ScannedItem, ScannedQuotation } from "@/lib/scan-quotation.functions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";


type Row = {
  vat_rate?: number | null;
  vat_amount?: number | null;
  amount_incl_vat?: number | null;
  id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  quotation_amount: number | null;
  received_date: string | null;
  notes: string | null;
  title?: string | null;
  file_urls: string[];
  version: number;
  is_selected: boolean;
  partners?: { name: string } | null;
};

export function SupplierQuotationsTab({
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
  const [rfqPrompt, setRfqPrompt] = useState<{ supplier: string; items: ScannedItem[] } | null>(null);
  const [savingRfq, setSavingRfq] = useState(false);

  const { data: partners } = usePartners("supplier");


  const { data: rows, isLoading } = useQuery({
    queryKey: ["supplier-quotations", projectId],
    queryFn: async () => {
      const { data, error } = await sb
        .from("supplier_quotations")
        .select("id, supplier_id, supplier_name, quotation_amount, vat_rate, vat_amount, amount_incl_vat, received_date, notes, title, file_urls, version, is_selected, partners(name)")
        .eq("project_id", projectId)
        .order("supplier_id", { ascending: true })
        .order("version", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("supplier_quotations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ลบเรียบร้อย");
      qc.invalidateQueries({ queryKey: ["supplier-quotations", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // โครงการหนึ่งมีได้หลายใบเสนอราคาจาก supplier — เลือกเป็น Final ได้มากกว่า 1 รายการ
  const toggleFinal = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: boolean }) => {
      const { error } = await sb
        .from("supplier_quotations")
        .update({ is_selected: next })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.next ? "เพิ่มเป็น Final แล้ว" : "ยกเลิก Final แล้ว");
      qc.invalidateQueries({ queryKey: ["supplier-quotations", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openFile = async (path: string) => {
    const url = await getProjectFileUrl(path);
    if (url) window.open(url, "_blank");
  };

  const cheapest = rows && rows.length ? Math.min(...rows.filter((r) => r.quotation_amount != null).map((r) => Number(r.quotation_amount))) : null;
  const selectedRows = (rows ?? []).filter((r) => r.is_selected);
  const selectedTotal = selectedRows.reduce((s, r) => s + Number(r.quotation_amount ?? 0), 0);

  return (
    <div className="space-y-4">
      {selectedRows.length > 0 && (
        <div className="tile space-y-2 border-success/40 bg-success/5 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <div className="text-[10px] font-semibold uppercase tracking-widest text-success">
              Final vendor · เลือกไว้ {selectedRows.length} รายการ
            </div>
          </div>
          <div className="space-y-1">
            {selectedRows.map((s) => (
              <div key={s.id} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{s.title || "ใบเสนอราคา (ไม่ได้ระบุหัวข้องาน)"}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {s.partners?.name || s.supplier_name || "-"} · v{s.version}
                  </span>
                </span>
                {canSeePrice && (
                  <span className="font-semibold tabular-nums">{fmtCurrency(s.quotation_amount, "THB")}</span>
                )}
              </div>
            ))}
          </div>
          {canSeePrice && selectedRows.length > 1 && (
            <div className="flex justify-between border-t border-success/30 pt-2 text-sm font-semibold">
              <span>รวม Final ทั้งหมด</span>
              <span className="tabular-nums">{fmtCurrency(selectedTotal, "THB")}</span>
            </div>
          )}
        </div>
      )}


      {canEdit && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-2 h-4 w-4" />เพิ่มใบเสนอราคา</Button>
            </DialogTrigger>
            <AddDialog
              projectId={projectId}
              partners={partners ?? []}
              existing={rows ?? []}
              onClose={() => setOpen(false)}
              onSaved={(scanned) => {
                setOpen(false);
                qc.invalidateQueries({ queryKey: ["supplier-quotations", projectId] });
                // ถามทุกครั้งที่สแกนแล้วได้รายการสินค้า/บริการ
                const items = scanned?.items ?? [];
                if (items.length > 0) {
                  setRfqPrompt({ supplier: scanned?.supplier ?? "Supplier", items });
                }
              }}
            />
          </Dialog>
        </div>
      )}

      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">กำลังโหลด...</div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState icon={Package} title="ยังไม่มีใบเสนอราคาจาก Supplier" description="เพิ่มใบเสนอราคาที่ได้รับจาก Supplier แต่ละราย" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => {
            const isCheap = cheapest != null && Number(r.quotation_amount) === cheapest;
            const supplierLabel = r.partners?.name || r.supplier_name || "-";
            return (
              <Card key={r.id} className={r.is_selected ? "ring-2 ring-success" : isCheap ? "ring-1 ring-primary/40" : ""}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold leading-snug">
                        {r.title || "ใบเสนอราคา (ไม่ได้ระบุหัวข้องาน)"}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{supplierLabel}</span>
                        <Badge variant="outline" className="text-[10px]">v{r.version}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{fmtDate(r.received_date)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {r.is_selected && <Badge className="bg-success/15 text-success">Final</Badge>}
                      {isCheap && !r.is_selected && <Badge className="bg-primary/10 text-primary">ราคาต่ำสุด</Badge>}
                    </div>
                  </div>
                  <div>
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
                  {r.notes && <p className="text-sm text-muted-foreground">{r.notes}</p>}
                  {r.file_urls?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {r.file_urls.map((f, i) => (
                        <span key={i} className="inline-flex gap-1">
                          <FilePreviewButton path={f} label={`ดูไฟล์ ${i + 1}`} />
                          <Button size="sm" variant="outline" onClick={() => openFile(f)} title="ดาวน์โหลด">
                            <Download className="h-3 w-3" />
                          </Button>
                        </span>
                      ))}
                    </div>
                  )}
                  {canEdit && (
                    <div className="flex items-center justify-between gap-2 border-t pt-2">
                      <Button
                        size="sm"
                        variant={r.is_selected ? "secondary" : "outline"}
                        onClick={() => toggleFinal.mutate({ id: r.id, next: !r.is_selected })}
                        disabled={toggleFinal.isPending}
                      >
                        <Star className={`mr-1 h-3.5 w-3.5 ${r.is_selected ? "fill-current text-success" : ""}`} />
                        {r.is_selected ? "ยกเลิก Final" : "เลือกเป็น Final"}
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => confirm("ลบใบเสนอราคานี้?") && remove.mutate(r.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!rfqPrompt} onOpenChange={(v) => !v && setRfqPrompt(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>นำรายการจากใบเสนอราคาไปใส่ใน RFQ / Spec ด้วยหรือไม่?</AlertDialogTitle>
            <AlertDialogDescription>
              ระบบอ่านรายการได้ {rfqPrompt?.items.length ?? 0} รายการจากใบเสนอราคาของ {rfqPrompt?.supplier}
              — สามารถบันทึกเป็นบันทึกข้อความในแท็บ RFQ / Spec เพื่อใช้อ้างอิงและค้นหาต่อได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          {rfqPrompt && (
            <pre className="max-h-52 overflow-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
              {itemsToText(rfqPrompt.items)}
            </pre>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>ไม่ใส่</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingRfq}
              onClick={async (e) => {
                e.preventDefault();
                if (!rfqPrompt) return;
                setSavingRfq(true);
                try {
                  const { error } = await sb.from("project_spec_notes").insert({
                    project_id: projectId,
                    note_type: "rfq_spec",
                    title: `รายการจากใบเสนอราคา - ${rfqPrompt.supplier}`,
                    content: itemsToText(rfqPrompt.items),
                  });
                  if (error) throw error;
                  toast.success("เพิ่มลงใน RFQ / Spec แล้ว");
                  qc.invalidateQueries({ queryKey: ["project-spec-notes", projectId, "rfq_spec"] });
                  qc.invalidateQueries({ queryKey: ["project-signals", projectId] });
                  setRfqPrompt(null);
                } catch (err) {
                  toast.error((err as Error).message);
                } finally {
                  setSavingRfq(false);
                }
              }}
            >
              {savingRfq && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}ใส่ใน RFQ / Spec
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** แปลงรายการที่สแกนได้เป็นข้อความสำหรับบันทึก RFQ / Spec (ไม่ใส่ราคา) */
function itemsToText(items: ScannedItem[]) {
  return items
    .map((it, i) => {
      const parts = [`${i + 1}. ${it.description ?? "-"}`];
      if (it.qty != null) parts.push(`จำนวน ${it.qty}${it.unit ? " " + it.unit : ""}`);
      else if (it.unit) parts.push(`หน่วย ${it.unit}`);
      return parts.join(" | ");
    })
    .join("\n");
}

function AddDialog({
  projectId,
  partners,
  existing,
  onClose,
  onSaved,
}: {
  projectId: string;
  partners: { id: string; name: string }[];
  existing: Row[];
  onClose: () => void;
  onSaved: (scanned?: { supplier: string; items: ScannedItem[] }) => void;
}) {
  const sb = getSupabase();
  const [scanned, setScanned] = useState<ScannedQuotation | null>(null);
  const [supplierId, setSupplierId] = useState<string>("");
  const [supplierName, setSupplierName] = useState("");
  const [partnerOpen, setPartnerOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [vatRateId, setVatRateId] = useState<string | undefined>(undefined);
  const { data: vatRates } = useVatRates();
  const selectedVat = pickVatRate(vatRates, vatRateId);
  const { pct, vatAmount, total } = calcVat(Number(amount) || 0, selectedVat ? Number(selectedVat.rate) : 0);

  // Suggest next version number for the chosen supplier
  const nextVersion = (() => {
    if (!supplierId && !supplierName) return 1;
    const matches = existing.filter((r) =>
      supplierId ? r.supplier_id === supplierId : r.supplier_name === supplierName
    );
    if (matches.length === 0) return 1;
    return Math.max(...matches.map((r) => r.version ?? 1)) + 1;
  })();

  const submit = async () => {
    setSaving(true);
    try {
      const file_urls: string[] = [];
      if (file) file_urls.push(await uploadProjectFile(projectId, file));
      const { error } = await sb.from("supplier_quotations").insert({
        project_id: projectId,
        supplier_id: supplierId || null,
        supplier_name: supplierName || null,
        quotation_amount: amount ? Number(amount) : null,
        vat_rate: selectedVat ? Number(selectedVat.rate) : 0,
        vat_amount: amount ? vatAmount : null,
        amount_incl_vat: amount ? total : null,
        received_date: date || null,
        notes: notes || null,
        title: title || null,
        version: nextVersion,
        file_urls,
      });
      if (error) throw error;
      toast.success("บันทึกเรียบร้อย");
      const items = (scanned?.items ?? []).filter((it) => it.description);
      const supplierLabel =
        partners.find((p) => p.id === supplierId)?.name || supplierName || scanned?.partner_name || "Supplier";
      onSaved(items.length ? { supplier: supplierLabel, items } : undefined);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
      <DialogHeader><DialogTitle>เพิ่มใบเสนอราคา Supplier</DialogTitle></DialogHeader>
      <div className="-mx-1 flex-1 space-y-3 overflow-y-auto px-1">

        <ScanQuotationCard
          onFile={(f) => setFile(f)}
          onScanned={(d) => {

            setScanned(d);
            if (d.amount_before_tax != null) setAmount(String(d.amount_before_tax));
            if (d.issue_date) setDate(d.issue_date);
            if (!supplierId && d.partner_name) {
              const match = partners.find((p) => p.name.trim().toLowerCase() === d.partner_name!.trim().toLowerCase());
              if (match) setSupplierId(match.id);
              else setSupplierName(d.partner_name);
            }
            const noteParts = [d.quotation_no ? `เลขที่ ${d.quotation_no}` : null, d.description].filter(Boolean);
            if (noteParts.length) setNotes(noteParts.join(" · "));
            // เดาหัวข้องานจากคำอธิบาย หรือรายการแรกในใบเสนอราคา
            const guess = d.description || d.items?.find((it) => it.description)?.description || "";
            if (guess) setTitle(String(guess).slice(0, 120));
          }}
        />
        <div>
          <Label>หัวข้องาน / ชื่อรายการ</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น งานพิมพ์กล่องของขวัญ Premium Gift"
          />
        </div>
        <div>
          <Label>Supplier (จากรายชื่อคู่ค้า)</Label>
          <div className="flex gap-2">
            <Select value={supplierId} onValueChange={(v) => { setSupplierId(v); setSupplierName(""); }}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="เลือก Supplier" /></SelectTrigger>
              <SelectContent>
                {partners.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="icon" title="เพิ่ม Supplier ใหม่" onClick={() => setPartnerOpen(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <PartnerFormDialog
            open={partnerOpen}
            onOpenChange={setPartnerOpen}
            defaultType="supplier"
            defaultName={supplierName}
            onSaved={(row) => { setSupplierId(row.id); setSupplierName(""); }}
          />
        </div>

        <div>
          <Label>หรือ พิมพ์ชื่อ Supplier</Label>
          <div className="flex gap-2">
            <Input
              className="flex-1"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="ชื่อ Supplier"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="บันทึกชื่อนี้เข้ารายชื่อคู่ค้าในระบบ"
              disabled={!supplierName.trim()}
              onClick={() => setPartnerOpen(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {supplierName.trim() && !supplierId && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              ชื่อนี้ยังไม่มีในระบบ · กด + เพื่อบันทึกเข้ารายชื่อคู่ค้า แล้วระบบจะเลือกให้อัตโนมัติ
            </p>
          )}
        </div>
        {(supplierId || supplierName) && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            จะบันทึกเป็น <span className="font-semibold text-foreground">เวอร์ชัน {nextVersion}</span> ของ Supplier รายนี้
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>ยอดเงินก่อน VAT (บาท)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>วันที่ได้รับ</Label>
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
          <Label>หมายเหตุ</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <div>
          <Label>ไฟล์แนบ</Label>
          <Input type="file" onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)} />
          {file && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              จะจัดเก็บไฟล์: <span className="font-medium text-foreground">{file.name}</span>
            </p>
          )}
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
