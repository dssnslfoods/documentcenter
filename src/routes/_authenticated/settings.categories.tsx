import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, FolderTree } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/settings/categories")({
  head: () => ({ meta: [{ title: "หมวดหมู่เอกสาร | Document Hub" }] }),
  component: CategoriesPage,
});

type Cat = {
  id: string;
  code: string;
  name_th: string;
  name_en: string | null;
  prefix: string | null;
  is_active: boolean;
};

function CategoriesPage() {
  const guard = useAdminGuard();
  const sb = getSupabase();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cat | null>(null);
  const [form, setForm] = useState({ code: "", name_th: "", name_en: "", prefix: "", is_active: true });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["document-categories-admin"],
    enabled: guard.allowed,
    queryFn: async () => {
      const { data, error } = await sb
        .from("document_categories")
        .select("id, code, name_th, name_en, prefix, is_active")
        .order("code");
      if (error) throw error;
      return (data ?? []) as Cat[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const p = {
        code: form.code.trim().toUpperCase(),
        name_th: form.name_th.trim(),
        name_en: form.name_en.trim() || null,
        prefix: form.prefix.trim().toUpperCase() || null,
        is_active: form.is_active,
      };
      if (!p.code || !p.name_th) throw new Error("กรุณากรอกรหัสและชื่อ");
      if (editing) {
        const { error } = await sb.from("document_categories").update(p).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("document_categories").insert(p);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "อัปเดตแล้ว" : "เพิ่มหมวดหมู่แล้ว");
      setOpen(false); setEditing(null);
      setForm({ code: "", name_th: "", name_en: "", prefix: "", is_active: true });
      qc.invalidateQueries({ queryKey: ["document-categories-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("document_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ลบแล้ว");
      qc.invalidateQueries({ queryKey: ["document-categories-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (c: Cat) => {
    setEditing(c);
    setForm({ code: c.code, name_th: c.name_th, name_en: c.name_en ?? "", prefix: c.prefix ?? "", is_active: c.is_active });
    setOpen(true);
  };
  const openNew = () => {
    setEditing(null);
    setForm({ code: "", name_th: "", name_en: "", prefix: "", is_active: true });
    setOpen(true);
  };

  if (guard.node) return guard.node;

  return (
    <div className="space-y-6">
      <SettingsNav />
      <PageHeader
        title="หมวดหมู่เอกสาร"
        description="กำหนดหมวดหมู่และรหัสนำหน้าที่ใช้ในการสร้างเลขเอกสาร"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> เพิ่มหมวดหมู่</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "แก้ไขหมวดหมู่" : "เพิ่มหมวดหมู่"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>รหัส *</Label>
                  <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="เช่น POLICY, MANUAL" />
                </div>
                <div><Label>ชื่อ (ไทย) *</Label>
                  <Input value={form.name_th} onChange={(e) => setForm({ ...form, name_th: e.target.value })} />
                </div>
                <div><Label>ชื่อ (Eng)</Label>
                  <Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
                </div>
                <div><Label>Prefix (สำหรับเลขเอกสาร)</Label>
                  <Input value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value })} placeholder="เช่น POL, MAN" />
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
            <EmptyState title="ยังไม่มีหมวดหมู่" icon={FolderTree} />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>รหัส</TableHead>
                <TableHead>ชื่อ (ไทย)</TableHead>
                <TableHead>ชื่อ (Eng)</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="w-[120px]"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono">{c.code}</TableCell>
                    <TableCell>{c.name_th}</TableCell>
                    <TableCell className="text-muted-foreground">{c.name_en ?? "-"}</TableCell>
                    <TableCell className="font-mono">{c.prefix ?? "-"}</TableCell>
                    <TableCell>{c.is_active ? "ใช้งาน" : "ปิด"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-destructive"
                          onClick={() => { if (confirm(`ลบหมวดหมู่ ${c.name_th}?`)) del.mutate(c.id); }}>
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
