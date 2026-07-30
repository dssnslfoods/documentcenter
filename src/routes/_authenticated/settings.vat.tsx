import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Percent } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { SettingsNav } from "@/components/settings-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getSupabase } from "@/lib/supabase";
import { useAdminGuard } from "@/hooks/use-admin-guard";
import { nextCode } from "@/lib/next-code";

export const Route = createFileRoute("/_authenticated/settings/vat")({
  head: () => ({
    meta: [
      { title: "อัตราภาษีมูลค่าเพิ่ม (VAT) | Document Hub" },
      { name: "description", content: "จัดการอัตราภาษีมูลค่าเพิ่มสำหรับใช้คำนวณมูลค่าสัญญาของโครงการ" },
    ],
  }),
  component: VatPage,
});

type VatRate = {
  id: string;
  code: string;
  label: string;
  rate: number;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
};

function VatPage() {
  const guard = useAdminGuard();
  const sb = getSupabase();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VatRate | null>(null);
  const [form, setForm] = useState({ code: "", label: "", rate: 7, is_default: false, is_active: true, sort_order: 0 });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["vat-rates-admin"],
    enabled: guard.allowed,
    queryFn: async () => {
      const { data, error } = await sb
        .from("vat_rates")
        .select("id, code, label, rate, is_default, is_active, sort_order")
        .order("sort_order").order("rate");
      if (error) throw error;
      return (data ?? []) as VatRate[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const rate = Number(form.rate);
      if (!(rate >= 0 && rate <= 100)) throw new Error("อัตรา VAT ต้องอยู่ระหว่าง 0-100");
      const basePayload = {
        label: form.label.trim() || `VAT ${rate}%`,
        rate,
        is_default: form.is_default,
        is_active: form.is_active,
        sort_order: Number(form.sort_order) || 0,
      };

      let code: string;
      if (editing) {
        code = form.code.trim().toUpperCase();
        const { error } = await sb.from("vat_rates").update({ ...basePayload, code }).eq("id", editing.id);
        if (error) throw error;
      } else {
        // Always derive the code from fresh DB rows; retry if another row grabbed it.
        const { data: fresh, error: readErr } = await sb.from("vat_rates").select("code");
        if (readErr) throw readErr;
        const taken = (fresh ?? []).map((r: { code: string }) => r.code);
        code = nextCode("VAT", taken);
        let inserted = false;
        for (let i = 0; i < 5 && !inserted; i++) {
          const { error } = await sb.from("vat_rates").insert({ ...basePayload, code });
          if (!error) { inserted = true; break; }
          if (error.code !== "23505") throw error;
          taken.push(code);
          code = nextCode("VAT", taken);
        }
        if (!inserted) throw new Error("ไม่สามารถสร้างรหัส VAT ที่ไม่ซ้ำได้ กรุณาลองใหม่");
      }

      if (basePayload.is_default) {
        const q = sb.from("vat_rates").update({ is_default: false }).eq("is_default", true);
        if (editing) await q.neq("id", editing.id);
        else await q.neq("code", code);
      }
    },

    onSuccess: () => {
      toast.success(editing ? "อัปเดตแล้ว" : "เพิ่มอัตรา VAT แล้ว");
      setOpen(false); setEditing(null);
      setForm({ code: "", label: "", rate: 7, is_default: false, is_active: true, sort_order: 0 });
      qc.invalidateQueries({ queryKey: ["vat-rates-admin"] });
      qc.invalidateQueries({ queryKey: ["vat-rates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("vat_rates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ลบแล้ว");
      qc.invalidateQueries({ queryKey: ["vat-rates-admin"] });
      qc.invalidateQueries({ queryKey: ["vat-rates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (v: VatRate) => {
    setEditing(v);
    setForm({ code: v.code, label: v.label, rate: Number(v.rate), is_default: v.is_default, is_active: v.is_active, sort_order: v.sort_order });
    setOpen(true);
  };
  const openNew = () => {
    setEditing(null);
    setForm({ code: "", label: "", rate: 7, is_default: false, is_active: true, sort_order: (rows?.length ?? 0) * 10 + 10 });
    setOpen(true);
  };

  if (guard.node) return guard.node;

  return (
    <div className="space-y-6">
      <SettingsNav />
      <PageHeader
        title="อัตราภาษีมูลค่าเพิ่ม (VAT)"
        description="กำหนดอัตรา VAT สำหรับคำนวณมูลค่าสัญญา — อัตราที่เลือกไว้แล้วในโครงการจะถูกบันทึกไว้ ไม่เปลี่ยนย้อนหลังเมื่อแก้ไขอัตราใหม่"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> เพิ่มอัตรา VAT</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "แก้ไขอัตรา VAT" : "เพิ่มอัตรา VAT ใหม่"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>รหัส {editing ? "" : "(สร้างอัตโนมัติ)"}</Label>
                  <Input
                    value={editing ? form.code : nextCode("VAT", (rows ?? []).map((r) => r.code))}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    readOnly={!editing}
                    className={!editing ? "bg-muted font-mono" : "font-mono"}
                  />
                </div>
                <div><Label>อัตรา (%) *</Label>
                  <Input type="number" step="0.01" min="0" max="100" value={form.rate}
                    onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })} />
                </div>
                <div><Label>ชื่อที่แสดง</Label>
                  <Input placeholder={`VAT ${form.rate}%`} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
                </div>
                <div><Label>ลำดับการแสดงผล</Label>
                  <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} />
                  <Label>ใช้เป็นค่าเริ่มต้น</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                  <Label>เปิดใช้งาน</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>ยกเลิก</Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending}>บันทึก</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">กำลังโหลด...</div>
          ) : !rows || rows.length === 0 ? (
            <EmptyState title="ยังไม่มีอัตรา VAT" icon={Percent} />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-[80px]">ลำดับ</TableHead>
                <TableHead>รหัส</TableHead>
                <TableHead>ชื่อที่แสดง</TableHead>
                <TableHead className="text-right">อัตรา (%)</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="w-[120px]"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="text-muted-foreground">{v.sort_order}</TableCell>
                    <TableCell className="font-mono">{v.code}</TableCell>
                    <TableCell>
                      {v.label}
                      {v.is_default && <Badge variant="outline" className="ml-2">ค่าเริ่มต้น</Badge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{Number(v.rate).toFixed(2)}</TableCell>
                    <TableCell>{v.is_active ? "ใช้งาน" : "ปิด"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(v)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-destructive"
                          onClick={() => { if (confirm(`ลบอัตรา ${v.label}?`)) del.mutate(v.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
