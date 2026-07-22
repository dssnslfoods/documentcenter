import { useState, type ChangeEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Download, Plus, Loader2, FileSpreadsheet, Star } from "lucide-react";
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

type Row = {
  id: string;
  quotation_amount: number | null;
  submitted_date: string | null;
  notes: string | null;
  file_url: string | null;
  is_final: boolean;
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
        .select("id, quotation_amount, submitted_date, notes, file_url, is_final")
        .eq("project_id", projectId)
        .order("submitted_date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("customer_quotations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ลบเรียบร้อย");
      qc.invalidateQueries({ queryKey: ["customer-quotations", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markFinal = useMutation({
    mutationFn: async (id: string) => {
      await sb.from("customer_quotations").update({ is_final: false }).eq("project_id", projectId);
      const { error } = await sb.from("customer_quotations").update({ is_final: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("กำหนดเป็นฉบับสุดท้ายแล้ว");
      qc.invalidateQueries({ queryKey: ["customer-quotations", projectId] });
    },
  });

  const openFile = async (path: string) => {
    const url = await getProjectFileUrl(path);
    if (url) window.open(url, "_blank");
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-2 h-4 w-4" />เพิ่ม Version</Button>
            </DialogTrigger>
            <AddDialog
              projectId={projectId}
              onClose={() => setOpen(false)}
              onSaved={() => {
                setOpen(false);
                qc.invalidateQueries({ queryKey: ["customer-quotations", projectId] });
              }}
            />
          </Dialog>
        </div>
      )}

      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">กำลังโหลด...</div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState icon={FileSpreadsheet} title="ยังไม่มีใบเสนอราคาที่ส่งให้ลูกค้า" description="เพิ่มแต่ละ Version พร้อมยอดเงินและไฟล์" />
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <Card key={r.id} className={r.is_final ? "border-primary" : ""}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  {r.is_final ? <Star className="h-5 w-5 fill-current" /> : `#${rows.length - i}`}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Version {rows.length - i}</span>
                    {r.is_final && <Badge className="bg-primary/15 text-primary">Final</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">ส่งเมื่อ {fmtDate(r.submitted_date)}</div>
                  {r.notes && <p className="mt-1 text-sm">{r.notes}</p>}
                </div>
                <div className="text-lg font-semibold tabular-nums">
                  {canSeePrice ? fmtCurrency(r.quotation_amount, "THB") : "฿ ••••••"}
                </div>
                <div className="flex gap-1">
                  {r.file_url && (
                    <Button size="sm" variant="outline" onClick={() => openFile(r.file_url!)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                  {canEdit && !r.is_final && (
                    <Button size="sm" variant="ghost" onClick={() => markFinal.mutate(r.id)}>
                      <Star className="h-4 w-4" />
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
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [isFinal, setIsFinal] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      let path: string | null = null;
      if (file) path = await uploadProjectFile(projectId, file);
      if (isFinal) {
        await sb.from("customer_quotations").update({ is_final: false }).eq("project_id", projectId);
      }
      const { error } = await sb.from("customer_quotations").insert({
        project_id: projectId,
        quotation_amount: amount ? Number(amount) : null,
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
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>เพิ่มใบเสนอราคาให้ลูกค้า</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>ยอดเสนอ (บาท)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>วันที่ส่ง</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>หมายเหตุ / เหตุผลการปรับ</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <div>
          <Label>ไฟล์แนบ (PDF)</Label>
          <Input type="file" onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)} />
          กำหนดเป็นฉบับสุดท้าย (Final)
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
