import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Save } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSupabase } from "@/lib/supabase";
import { nextCode } from "@/lib/next-code";
import { PartnerFormDialog, usePartners } from "@/components/partner-form-dialog";
import { ROLE_PERMISSIONS, canCreateProjects } from "@/lib/project-roles";
import { useMyRoles } from "@/hooks/use-page-access";
import { PageHeader as _PH } from "@/components/page-header";

const AUTOSAVE_KEY = "dochub:new-project-autosave";

const schema = z.object({
  name: z.string().trim().min(1, "กรุณากรอกชื่อโครงการ").max(200),
  description: z.string().optional(),
  customer_name: z.string().trim().max(200).optional(),
  customer_id: z.string().uuid().optional(),
  project_type: z.string().trim().min(1, "กรุณาเลือกประเภทงาน"),
  start_date: z.string().optional().or(z.literal("")),
  end_date: z.string().optional().or(z.literal("")),
  contract_value: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  budget: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  is_inhouse: z.boolean().optional(),
  vat_rate_id: z.string().optional(),

}).refine(
  (v) => !v.start_date || !v.end_date || new Date(v.end_date) >= new Date(v.start_date),
  { path: ["end_date"], message: "วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่ม" },
);

type FormValues = z.infer<typeof schema>;

export const Route = createFileRoute("/_authenticated/projects/new")({
  head: () => ({ meta: [{ title: "เพิ่มโครงการใหม่ | Document Hub" }] }),
  component: NewProject,
});

function NewProject() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [wtOpen, setWtOpen] = useState(false);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const { data: customers } = usePartners("customer");
  const [wtName, setWtName] = useState("");

  const { data: workTypes } = useQuery({
    queryKey: ["work-types"],
    queryFn: async () => (await getSupabase().from("work_types").select("id, code, name_th").eq("is_active", true).order("sort_order").order("name_th")).data ?? [],
  });

  const { data: vatRates } = useQuery({
    queryKey: ["vat-rates"],
    queryFn: async () =>
      (await getSupabase()
        .from("vat_rates")
        .select("id, label, rate, is_default")
        .eq("is_active", true)
        .order("sort_order")
        .order("rate")).data ?? [],
  });

  const addWorkType = useMutation({
    mutationFn: async (name: string) => {
      const sb = getSupabase();
      const trimmed = name.trim();
      if (!trimmed) throw new Error("กรุณากรอกชื่อประเภทงาน");
      const { data: all, error: readErr } = await sb.from("work_types").select("code, sort_order");
      if (readErr) throw readErr;
      const code = nextCode("WT", (all ?? []).map((r: { code: string }) => r.code));
      const sort_order = ((all ?? []).length + 1) * 10;
      const { data, error } = await sb
        .from("work_types")
        .insert({ code, name_th: trimmed, is_active: true, sort_order })
        .select("id, name_th")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row: { name_th: string }) => {
      toast.success("เพิ่มประเภทงานแล้ว");
      setWtOpen(false);
      qc.invalidateQueries({ queryKey: ["work-types"] });
      qc.invalidateQueries({ queryKey: ["work-types-admin"] });
      form.setValue("project_type", row.name_th, { shouldValidate: true });
    },
    onError: (e: Error) => toast.error("เพิ่มประเภทงานไม่สำเร็จ", { description: e.message }),
  });


  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: {},
  });

  const vatRateId = form.watch("vat_rate_id");
  const contractValueRaw = form.watch("contract_value");
  const defaultVat = (vatRates ?? []).find((v: { is_default: boolean }) => v.is_default);
  const selectedVat = vatRateId === "none"
    ? undefined
    : ((vatRates ?? []).find((v: { id: string }) => v.id === vatRateId) ?? defaultVat);
  const netAmount = Number(contractValueRaw) || 0;
  const vatPercent = selectedVat ? Number(selectedVat.rate) : 0;
  const vatAmount = Math.round(netAmount * vatPercent) / 100;
  const grossAmount = Math.round((netAmount + vatAmount) * 100) / 100;

  const [isDraft, setIsDraft] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [restored, setRestored] = useState(false);
  const hydrated = useRef(false);

  // Restore autosaved form data (once, on mount)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { values?: FormValues; at?: string };
        if (parsed.values && Object.values(parsed.values).some((v) => v !== "" && v != null && v !== false)) {
          form.reset(parsed.values);
          setSavedAt(parsed.at ? new Date(parsed.at) : null);
          setRestored(true);
        }
      }
    } catch {
      /* ignore corrupt autosave */
    }
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave on change (debounced)
  useEffect(() => {
    const sub = form.watch((values) => {
      if (!hydrated.current) return;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        const at = new Date();
        try {
          localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ values, at: at.toISOString() }));
          setSavedAt(at);
        } catch {
          /* storage full or unavailable */
        }
      }, 700);
    });
    return () => {
      sub.unsubscribe();
      window.clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveTimer = useRef<number | undefined>(undefined);

  const clearAutosave = () => {
    try {
      localStorage.removeItem(AUTOSAVE_KEY);
    } catch {
      /* ignore */
    }
    setSavedAt(null);
    setRestored(false);
  };

  const discardAutosave = () => {
    window.clearTimeout(saveTimer.current);
    form.reset({});
    clearAutosave();
    toast.success("ล้างข้อมูลที่บันทึกอัตโนมัติแล้ว");
  };

  const saveDraft = () => {
    const values = form.getValues();
    if (!values.name?.trim()) {
      form.setError("name", { message: "กรุณากรอกชื่อโครงการอย่างน้อย 1 ช่อง เพื่อบันทึกร่าง" });
      return;
    }
    setIsDraft(true);
    create.mutate(values);
  };


  const create = useMutation({
    mutationFn: async (values: FormValues) => {
      const sb = getSupabase();
      const { data: user } = await sb.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");
      const payload = {
        name: values.name,
        description: values.description || null,
        customer_name: values.customer_name || null,
        customer_id: values.customer_id || null,
        project_type: values.project_type || null,
        start_date: values.start_date || null,
        end_date: values.end_date || null,
        contract_value: values.contract_value === "" || values.contract_value == null ? null : Number(values.contract_value),
        budget: values.contract_value === "" || values.contract_value == null ? null : Number(values.contract_value),
        is_inhouse: !!values.is_inhouse,
        vat_rate: selectedVat ? Number(selectedVat.rate) : null,
        vat_amount: values.contract_value === "" || values.contract_value == null ? null : vatAmount,
        contract_value_incl_vat: values.contract_value === "" || values.contract_value == null ? null : grossAmount,

        status: "draft",

        owner_id: user.user.id,
        created_by: user.user.id,
      };
      const { data, error } = await sb.from("projects").insert(payload).select("id").single();
      if (error) throw error;

      // ผู้สร้างโครงการเป็นผู้บริหารโครงการเสมอ (ต้องมีอย่างน้อย 1 คน)
      const { data: member } = await sb
        .from("project_members")
        .insert({
          project_id: data.id,
          user_id: user.user.id,
          added_by: user.user.id,
          project_role: "exec",
          role_title: "ผู้บริหารโครงการ",
        })
        .select("id")
        .maybeSingle();
      if (member?.id) {
        await sb.from("project_member_permissions").insert(
          ROLE_PERMISSIONS.exec.map((k) => ({ project_member_id: member.id, permission_key: k, granted: true })),
        );
      }
      return data;
    },
    onSuccess: (row) => {
      window.clearTimeout(saveTimer.current);
      clearAutosave();
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(isDraft ? "บันทึกร่างโครงการแล้ว" : "เพิ่มโครงการสำเร็จ");
      navigate({ to: "/projects/$id", params: { id: row.id } });
    },
    onError: (e: Error) => {
      setIsDraft(false);
      toast.error(isDraft ? "บันทึกร่างไม่สำเร็จ" : "เพิ่มโครงการไม่สำเร็จ", { description: e.message });
    },

  });

  return (
    <div className="max-w-3xl">
      <PageHeader title="เพิ่มโครงการใหม่" description="รหัสจะถูกสร้างอัตโนมัติ (PRJ-YYYY-NNNN) — โครงการจะเริ่มที่สถานะ 'ร่าง'" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-xs">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Save className="h-3.5 w-3.5" />
          {restored
            ? "กู้คืนข้อมูลที่กรอกค้างไว้แล้ว — ระบบบันทึกอัตโนมัติในเครื่องของคุณ"
            : savedAt
              ? `บันทึกอัตโนมัติเมื่อ ${savedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
              : "ระบบจะบันทึกสิ่งที่กรอกอัตโนมัติ เพื่อไม่ให้ข้อมูลหายระหว่างกรอก"}
        </span>
        {(savedAt || restored) && (
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={discardAutosave}>
            ล้างข้อมูลที่บันทึกไว้
          </Button>
        )}
      </div>

      <form onSubmit={form.handleSubmit((v) => { setIsDraft(false); create.mutate(v); })} className="space-y-6">

        <Card>
          <CardHeader><CardTitle>ข้อมูลโครงการ</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-2">
              <Label>ชื่อโครงการ *</Label>
              <Input {...form.register("name")} />
              {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>ลูกค้า</Label>
              <div className="flex gap-2">
                <Select
                  value={form.watch("customer_id") || undefined}
                  onValueChange={(v) => {
                    const c = (customers ?? []).find((x) => x.id === v);
                    form.setValue("customer_id", v);
                    form.setValue("customer_name", c?.name ?? "");
                  }}
                >
                  <SelectTrigger className="flex-1"><SelectValue placeholder="เลือกลูกค้าจากฐานข้อมูล" /></SelectTrigger>
                  <SelectContent>
                    {(customers ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="mr-2 font-mono text-xs text-muted-foreground">{c.code}</span>{c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" onClick={() => setPartnerOpen(true)} aria-label="เพิ่มลูกค้าใหม่">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <PartnerFormDialog
                open={partnerOpen}
                onOpenChange={setPartnerOpen}
                defaultType="customer"
                onSaved={(row) => {
                  form.setValue("customer_id", row.id);
                  form.setValue("customer_name", row.name);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>ประเภทงาน *</Label>
              <div className="flex gap-2">
                <Select value={form.watch("project_type") || ""} onValueChange={(v) => form.setValue("project_type", v, { shouldValidate: true })}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="เลือกประเภทงาน" /></SelectTrigger>
                  <SelectContent>
                    {workTypes?.map((w: { id: string; code: string; name_th: string }) => (
                      <SelectItem key={w.id} value={w.name_th}>{w.name_th}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" title="เพิ่มประเภทงาน" onClick={() => { setWtName(""); setWtOpen(true); }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {form.formState.errors.project_type && <p className="text-xs text-destructive">{form.formState.errors.project_type.message}</p>}
              {(!workTypes || workTypes.length === 0) && (
                <p className="text-xs text-muted-foreground">ยังไม่มีประเภทงาน — กด + เพื่อเพิ่มประเภทงานใหม่</p>
              )}
            </div>

            <div className="sm:col-span-2 flex items-start gap-3 rounded-xl border bg-muted/30 p-3">
              <Checkbox
                id="is_inhouse"
                checked={!!form.watch("is_inhouse")}
                onCheckedChange={(c) => form.setValue("is_inhouse", c === true)}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <Label htmlFor="is_inhouse" className="cursor-pointer">งานผลิตภายใน (ไม่ใช้ Supplier / Outsource)</Label>
                <p className="text-xs text-muted-foreground">
                  เมื่อเลือก ระบบจะข้ามขั้นตอน RFQ / Spec และใบเสนอราคา Supplier — ไปที่การยื่นข้อเสนอลูกค้าได้ทันที
                </p>
              </div>
            </div>

            <div className="sm:col-span-2 space-y-2">
              <Label>รายละเอียด</Label>
              <Textarea rows={3} {...form.register("description")} />
            </div>

          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>ระยะเวลาและมูลค่า</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2"><Label>วันเริ่ม</Label><Input type="date" {...form.register("start_date")} /></div>
            <div className="space-y-2">
              <Label>วันสิ้นสุด</Label>
              <Input type="date" {...form.register("end_date")} />
              {form.formState.errors.end_date && <p className="text-xs text-destructive">{form.formState.errors.end_date.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>มูลค่าสัญญา ก่อน VAT (บาท)</Label>
              <Input type="number" step="0.01" min="0" {...form.register("contract_value")} />
            </div>
            <div className="space-y-2">
              <Label>อัตรา VAT</Label>
              <Select value={vatRateId ?? selectedVat?.id ?? "none"} onValueChange={(v) => form.setValue("vat_rate_id", v)}>
                <SelectTrigger><SelectValue placeholder="เลือกอัตรา VAT" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ไม่มี VAT (0%)</SelectItem>
                  {(vatRates ?? []).map((v: { id: string; label: string; rate: number }) => (
                    <SelectItem key={v.id} value={v.id}>{v.label} ({Number(v.rate).toFixed(2)}%)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-3 rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">มูลค่าก่อน VAT</span><span className="tabular-nums">{netAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">VAT {vatPercent.toFixed(2)}%</span><span className="tabular-nums">{vatAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</span></div>
              <div className="mt-1 flex justify-between border-t pt-1 font-semibold"><span>รวมทั้งสิ้น</span><span className="tabular-nums">{grossAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</span></div>
              <p className="mt-2 text-xs text-muted-foreground">ระบบจะบันทึกอัตรา VAT ที่เลือก ณ ตอนนี้ไว้กับโครงการ — การแก้ไขอัตรา VAT ในตั้งค่าระบบภายหลังจะไม่มีผลย้อนหลัง</p>
            </div>

          </CardContent>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate({ to: "/projects" })}>ยกเลิก</Button>
          <Button type="button" variant="outline" onClick={saveDraft} disabled={create.isPending}>
            {create.isPending && isDraft && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}บันทึกร่าง
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending && !isDraft && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}บันทึกโครงการ
          </Button>
        </div>
        <p className="text-right text-xs text-muted-foreground">บันทึกร่าง: กรอกแค่ชื่อโครงการก็บันทึกได้ แล้วกลับมาแก้ไขภายหลัง</p>

      </form>

      <Dialog open={wtOpen} onOpenChange={setWtOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>เพิ่มประเภทงานใหม่</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>ชื่อประเภทงาน (ภาษาไทย) *</Label>
            <Input
              value={wtName}
              onChange={(e) => setWtName(e.target.value)}
              placeholder="เช่น ติดตั้งระบบ"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addWorkType.mutate(wtName); } }}
            />
            <p className="text-xs text-muted-foreground">รหัสจะถูกสร้างอัตโนมัติ (WT001, WT002, ...) และบันทึกเป็น Master Data</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" type="button" onClick={() => setWtOpen(false)}>ยกเลิก</Button>
            <Button type="button" onClick={() => addWorkType.mutate(wtName)} disabled={addWorkType.isPending}>
              {addWorkType.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
}
