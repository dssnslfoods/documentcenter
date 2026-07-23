import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Briefcase } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { SettingsNav } from "@/components/settings-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getSupabase } from "@/lib/supabase";
import { useAdminGuard } from "@/hooks/use-admin-guard";

export const Route = createFileRoute("/_authenticated/settings/work-types")({
  head: () => ({ meta: [{ title: "ประเภทงาน | Document Hub" }] }),
  component: WorkTypesPage,
});

type WT = {
  id: string;
  code: string;
  name_th: string;
  name_en: string | null;
  is_active: boolean;
  sort_order: number;
};

function WorkTypesPage() {
  const guard = useAdminGuard();
  const sb = getSupabase();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WT | null>(null);
  const [form, setForm] = useState({ code: "", name_th: "", name_en: "", is_active: true, sort_order: 0 });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["work-types-admin"],
    enabled: guard.allowed,
    queryFn: async () => {
      const { data, error } = await sb
        .from("work_types")
        .select("id, code, name_th, name_en, is_active, sort_order")
        .order("sort_order").order("name_th");
      if (error) throw error;
      return (data ?? []) as WT[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code.trim().toUpperCase(),
        name_th: form.name_th.trim(),
        name_en: form.name_en.trim() || null,
        is_active: form.is_active,
        sort_order: Number(form.sort_order) || 0,
      };
      if (!payload.code || !payload.name_th) throw new Error("กรุณากรอกรหัสและชื่อประเภทงาน");
      if (editing) {
        const { error } = await sb.from("work_types").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("work_types").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "อัปเดตแล้ว" : "เพิ่มประเภทงานแล้ว");
      setOpen(false); setEditing(null);
      setForm({ code: "", name_th: "", name_en: "", is_active: true, sort_order: 0 });
      qc.invalidateQueries({ queryKey: ["work-types-admin"] });
      qc.invalidateQueries({ queryKey: ["work-types"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("work_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ลบแล้ว");
      qc.invalidateQueries({ queryKey: ["work-types-admin"] });
      qc.invalidateQueries({ queryKey: ["work-types"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (w: WT) => {
    setEditing(w);
    setForm({ code: w.code, name_th: w.name_th, name_en: w.name_en ?? "", is_active: w.is_active, sort_order: w.sort_order });
    setOpen(true);
  };
  const openNew = () => {
    setEditing(null);
    setForm({ code: "", name_th: "", name_en: "", is_active: true, sort_order: (rows?.length ?? 0) * 10 + 10 });
    setOpen(true);
  };

  if (guard.node) return guard.node;

  return (
    <div className="space-y-6">
      <SettingsNav />
      <PageHeader
        title="ประเภทงาน"
        description="จัดการประเภทงานสำหรับใช้กับโครงการ (เช่น ติดตั้งระบบ, ก่อสร้าง, บำรุงรักษา)"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> เพิ่มประเภทงาน</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "แก้ไขประเภทงาน" : "เพิ่มประเภทงานใหม่"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>รหัส *</Label>
                  <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="เช่น INSTALL, CONSTRUCT" />
                </div>
                <div><Label>ชื่อ (ภาษาไทย) *</Label>
                  <Input value={form.name_th} onChange={(e) => setForm({ ...form, name_th: e.target.value })} />
                </div>
                <div><Label>ชื่อ (English)</Label>
                  <Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
                </div>
                <div><Label>ลำดับการแสดงผล</Label>
                  <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
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
            <EmptyState title="ยังไม่มีประเภทงาน" icon={Briefcase} />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-[80px]">ลำดับ</TableHead>
                <TableHead>รหัส</TableHead>
                <TableHead>ชื่อ (ไทย)</TableHead>
                <TableHead>ชื่อ (Eng)</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="w-[120px]"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="text-muted-foreground">{w.sort_order}</TableCell>
                    <TableCell className="font-mono">{w.code}</TableCell>
                    <TableCell>{w.name_th}</TableCell>
                    <TableCell className="text-muted-foreground">{w.name_en ?? "-"}</TableCell>
                    <TableCell>{w.is_active ? "ใช้งาน" : "ปิด"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(w)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-destructive"
                          onClick={() => { if (confirm(`ลบประเภทงาน ${w.name_th}?`)) del.mutate(w.id); }}>
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
