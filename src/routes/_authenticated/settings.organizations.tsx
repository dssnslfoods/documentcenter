import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { PageHeader, EmptyState } from "@/components/page-header";
import { SettingsNav } from "@/components/settings-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Building2, Plus, Pencil, ShieldAlert, Check } from "lucide-react";
import { useIsPlatformOwner, useOrganizations, useMyOrg, useSwitchOrg, type Organization } from "@/lib/org";

export const Route = createFileRoute("/_authenticated/settings/organizations")({
  head: () => ({
    meta: [
      { title: "องค์กร | Document Hub" },
      { name: "description", content: "จัดการองค์กรทั้งหมดในระบบ สำหรับผู้ดูแลแพลตฟอร์ม" },
    ],
  }),
  component: OrganizationsPage,
});

type FormState = {
  id?: string;
  code: string;
  name: string;
  name_en: string;
  tax_id: string;
  phone: string;
  email: string;
  address: string;
  is_active: boolean;
};

const emptyForm: FormState = {
  code: "", name: "", name_en: "", tax_id: "", phone: "", email: "", address: "", is_active: true,
};

function nextCode(existing: string[]) {
  const nums = existing
    .map((c) => /^ORG(\d+)$/.exec(c)?.[1])
    .filter(Boolean)
    .map((n) => Number(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `ORG${String(next).padStart(3, "0")}`;
}

function OrganizationsPage() {
  const qc = useQueryClient();
  const { isPlatformOwner, isLoading: roleLoading } = useIsPlatformOwner();
  const { data: orgs, isLoading } = useOrganizations(isPlatformOwner);
  const { data: myOrg } = useMyOrg();
  const switchOrg = useSwitchOrg();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      const payload = {
        code: f.code.trim(),
        name: f.name.trim(),
        name_en: f.name_en.trim() || null,
        tax_id: f.tax_id.trim() || null,
        phone: f.phone.trim() || null,
        email: f.email.trim() || null,
        address: f.address.trim() || null,
        is_active: f.is_active,
      };
      const sb = getSupabase();
      if (f.id) {
        const { error } = await sb.from("organizations").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("organizations").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("บันทึกข้อมูลองค์กรแล้ว");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["organizations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (roleLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">กำลังตรวจสอบสิทธิ์...</div>;
  }

  if (!isPlatformOwner) {
    return (
      <div className="space-y-6">
        <PageHeader title="องค์กร" description="สำหรับผู้ดูแลแพลตฟอร์มเท่านั้น" />
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>ไม่มีสิทธิ์เข้าถึง</AlertTitle>
          <AlertDescription>
            เฉพาะผู้ดูแลแพลตฟอร์ม (platform owner) เท่านั้นที่จัดการรายการองค์กรได้
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const openNew = () => {
    setForm({ ...emptyForm, code: nextCode((orgs ?? []).map((o) => o.code)) });
    setOpen(true);
  };

  const openEdit = (o: Organization) => {
    setForm({
      id: o.id,
      code: o.code,
      name: o.name,
      name_en: o.name_en ?? "",
      tax_id: o.tax_id ?? "",
      phone: o.phone ?? "",
      email: o.email ?? "",
      address: o.address ?? "",
      is_active: o.is_active,
    });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="องค์กร"
        description="จัดการองค์กรที่ใช้งานระบบนี้ — ข้อมูลของแต่ละองค์กรถูกแยกออกจากกันโดยสมบูรณ์"
        actions={
          <Button onClick={openNew} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />เพิ่มองค์กร
          </Button>
        }
      />
      <SettingsNav />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">กำลังโหลด...</div>
          ) : !orgs?.length ? (
            <EmptyState icon={Building2} title="ยังไม่มีองค์กร" description="เพิ่มองค์กรแรกเพื่อเริ่มใช้งาน" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">รหัส</TableHead>
                    <TableHead>ชื่อองค์กร</TableHead>
                    <TableHead className="hidden md:table-cell">เลขผู้เสียภาษี</TableHead>
                    <TableHead className="hidden lg:table-cell">ติดต่อ</TableHead>
                    <TableHead className="whitespace-nowrap">สถานะ</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgs.map((o) => {
                    const active = myOrg?.activeId === o.id;
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-xs">{o.code}</TableCell>
                        <TableCell>
                          <div className="font-medium">{o.name}</div>
                          {o.name_en && <div className="text-xs text-muted-foreground">{o.name_en}</div>}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{o.tax_id || "—"}</TableCell>
                        <TableCell className="hidden lg:table-cell text-sm">
                          {o.phone || o.email || "—"}
                        </TableCell>
                        <TableCell>
                          {o.is_active ? (
                            <Badge className="bg-success/10 text-success">ใช้งาน</Badge>
                          ) : (
                            <Badge variant="secondary">ปิดใช้งาน</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant={active ? "secondary" : "outline"}
                              disabled={active || switchOrg.isPending}
                              onClick={() => switchOrg.mutate(o.id, { onSuccess: () => toast.success(`สลับไปยัง ${o.name}`) })}
                            >
                              {active ? <Check className="h-3.5 w-3.5" /> : "เข้าดู"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => openEdit(o)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        โหมดปัจจุบัน:{" "}
        {myOrg?.activeId ? (
          <span className="font-medium text-foreground">{myOrg.org?.name}</span>
        ) : (
          <span className="font-medium text-foreground">ทุกองค์กร (มุมมองแพลตฟอร์ม)</span>
        )}
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "แก้ไของค์กร" : "เพิ่มองค์กรใหม่"}</DialogTitle>
            <DialogDescription>ข้อมูลพื้นฐานขององค์กรที่ใช้งานระบบ</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>รหัสองค์กร</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>ชื่อองค์กร (ไทย)</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>ชื่อองค์กร (อังกฤษ)</Label>
              <Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>เลขประจำตัวผู้เสียภาษี</Label>
              <Input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>โทรศัพท์</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>อีเมล</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>ที่อยู่</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label className="font-normal">เปิดใช้งานองค์กรนี้</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button
              disabled={!form.code.trim() || !form.name.trim() || save.isPending}
              onClick={() => save.mutate(form)}
            >
              บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
