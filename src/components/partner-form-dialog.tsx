import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSupabase } from "@/lib/supabase";
import { nextCode } from "@/lib/next-code";

export type Partner = {
  id: string;
  code: string;
  name: string;
  type: "customer" | "supplier" | "both";
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  business_type: string | null;
  credit_terms: string | null;
  notes: string | null;
  status: "active" | "inactive" | "blocked";
};

export type PartnerFormValues = {
  name: string;
  type: Partner["type"];
  tax_id: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  business_type: string;
  credit_terms: string;
  notes: string;
  status: Partner["status"];
};

const empty: PartnerFormValues = {
  name: "", type: "both", tax_id: "", address: "", phone: "", email: "", website: "",
  business_type: "", credit_terms: "", notes: "", status: "active",
};

export function usePartners(type?: "customer" | "supplier") {
  return useQuery({
    queryKey: ["partners-active", type ?? "all"],
    queryFn: async () => {
      let q = getSupabase().from("partners").select("id, code, name, type").eq("status", "active");
      if (type) q = q.in("type", [type, "both"]);
      const { data } = await q.order("name");
      return (data ?? []) as { id: string; code: string; name: string; type: string }[];
    },
  });
}

export function PartnerFormDialog({
  open,
  onOpenChange,
  editing,
  defaultType,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: Partner | null;
  defaultType?: Partner["type"];
  onSaved?: (row: { id: string; name: string }) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<PartnerFormValues>({ ...empty, type: defaultType ?? "both" });
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name,
        type: editing.type,
        tax_id: editing.tax_id ?? "",
        address: editing.address ?? "",
        phone: editing.phone ?? "",
        email: editing.email ?? "",
        website: editing.website ?? "",
        business_type: editing.business_type ?? "",
        credit_terms: editing.credit_terms ?? "",
        notes: editing.notes ?? "",
        status: editing.status,
      });
      setCode(editing.code);
    } else {
      setForm({ ...empty, type: defaultType ?? "both" });
      setCode("");
    }
  }, [open, editing, defaultType]);

  const save = useMutation({
    mutationFn: async () => {
      const sb = getSupabase();
      const name = form.name.trim();
      if (!name) throw new Error("กรุณากรอกชื่อคู่ค้า/ลูกค้า");
      if (name.length > 200) throw new Error("ชื่อยาวเกินไป");
      if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) throw new Error("อีเมลไม่ถูกต้อง");

      const payload = {
        name,
        type: form.type,
        tax_id: form.tax_id.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        business_type: form.business_type.trim() || null,
        credit_terms: form.credit_terms.trim() || null,
        notes: form.notes.trim() || null,
        status: form.status,
      };

      if (editing) {
        const { data, error } = await sb.from("partners").update(payload).eq("id", editing.id).select("id, code, name, type, status").single();
        if (error) throw error;
        return data;
      }
      const { data: all, error: readErr } = await sb.from("partners").select("code");
      if (readErr) throw readErr;
      const newCode = nextCode("PT-", (all ?? []).map((r: { code: string }) => r.code), 4);
      const { data, error } = await sb.from("partners").insert({ ...payload, code: newCode }).select("id, code, name, type, status").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      toast.success(editing ? "บันทึกข้อมูลแล้ว" : "เพิ่มคู่ค้า/ลูกค้าแล้ว");

      // เติมรายการใหม่เข้า cache ทันที เพื่อให้เลือกใช้ได้เลยโดยไม่ต้องรอโหลดใหม่
      const r = row as { id: string; code: string; name: string; type: string; status: string };
      if (r?.id && r.status === "active") {
        type PRow = { id: string; code: string; name: string; type: string };
        qc.getQueriesData<PRow[]>({ queryKey: ["partners-active"] }).forEach(([key, old]) => {
          if (!old) return;
          const filterType = (key as unknown[])[1] as string | undefined;
          const matches = !filterType || filterType === "all" || r.type === filterType || r.type === "both";
          const rest = old.filter((p) => p.id !== r.id);
          const next = matches ? [...rest, { id: r.id, code: r.code, name: r.name, type: r.type }] : rest;
          qc.setQueryData(key, next.sort((a, b) => a.name.localeCompare(b.name)));
        });
      }


      qc.invalidateQueries({ queryKey: ["partners-list"] });
      qc.invalidateQueries({ queryKey: ["partners-active"] });
      onOpenChange(false);
      onSaved?.(row as { id: string; name: string });
    },
    onError: (e: Error) => toast.error("ไม่สำเร็จ", { description: e.message }),
  });


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "แก้ไขคู่ค้า / ลูกค้า" : "เพิ่มคู่ค้า / ลูกค้าใหม่"}</DialogTitle>
          <DialogDescription>รหัสจะถูกสร้างอัตโนมัติ (PT-0001)</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {editing && (
            <div className="space-y-1">
              <Label>รหัส</Label>
              <Input value={code} readOnly className="bg-muted font-mono" />
            </div>
          )}
          <div className="space-y-1 sm:col-span-2">
            <Label>ชื่อ (บริษัท/หน่วยงาน) *</Label>
            <Input maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>ประเภท *</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as Partner["type"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">ลูกค้า</SelectItem>
                <SelectItem value="supplier">คู่ค้า / Supplier</SelectItem>
                <SelectItem value="both">ทั้งลูกค้าและคู่ค้า</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>สถานะ</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Partner["status"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">ใช้งาน</SelectItem>
                <SelectItem value="inactive">ไม่ใช้งาน</SelectItem>
                <SelectItem value="blocked">บล็อก</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>เลขประจำตัวผู้เสียภาษี</Label>
            <Input maxLength={20} value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>ประเภทธุรกิจ</Label>
            <Input maxLength={100} value={form.business_type} onChange={(e) => setForm({ ...form, business_type: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>โทรศัพท์</Label>
            <Input maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>อีเมล</Label>
            <Input type="email" maxLength={255} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>เว็บไซต์</Label>
            <Input maxLength={255} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>เงื่อนไขการชำระเงิน</Label>
            <Input maxLength={100} placeholder="เช่น เครดิต 30 วัน" value={form.credit_terms} onChange={(e) => setForm({ ...form, credit_terms: e.target.value })} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>ที่อยู่</Label>
            <Textarea rows={2} maxLength={500} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>หมายเหตุ</Label>
            <Textarea rows={2} maxLength={1000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>บันทึก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
