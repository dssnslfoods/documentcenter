import { useState } from "react";
import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, FolderKanban, Plus, AlertCircle, CheckCircle2, HelpCircle } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabase } from "@/lib/supabase";
import { PartnerFormDialog } from "@/components/partner-form-dialog";
import { useVatRates, calcVat, pickVatRate } from "@/lib/vat";
import { ScanQuotationCard } from "@/components/scan-quotation-card";
import type { ScannedQuotation } from "@/lib/scan-quotation.functions";
import { usePageGuard } from "@/hooks/use-page-access";

const schema = z.object({
  project_id: z.string().uuid("กรุณาเลือกโครงการ"),
  title: z.string().trim().min(1, "กรุณากรอกหัวข้อ").max(200),
  type: z.enum(["incoming", "outgoing"]),
  partner_id: z.string().uuid("กรุณาเลือกคู่ค้า"),
  department_id: z.string().uuid().optional().or(z.literal("")),
  issue_date: z.string().optional().or(z.literal("")),
  expiry_date: z.string().optional().or(z.literal("")),
  amount_before_tax: z.coerce.number().min(0).default(0),
  discount: z.coerce.number().min(0).default(0),
  tax: z.coerce.number().min(0).default(0),
  currency: z.string().default("THB"),
  description: z.string().optional(),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const searchSchema = z.object({ project: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/quotations/new")({
  head: () => ({ meta: [{ title: "เพิ่มใบเสนอราคา | Document Hub" }] }),
  validateSearch: searchSchema,
  component: GuardedNewQuotation,
});

function FieldConfidence({ score }: { score: number | null | undefined }) {
  if (score == null) return null;
  const high = score >= 0.9;
  const medium = score >= 0.7;
  return (
    <span
      className={`ml-2 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        high
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          : medium
            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
      }`}
      title={`ความมั่นใจ ${Math.round(score * 100)}%`}
    >
      {high ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
      {Math.round(score * 100)}%
    </span>
  );
}

function GuardedNewQuotation() {
  const guard = usePageGuard("quotations", "ใบเสนอราคา");
  if (!guard.allowed) return guard.node;
  return <NewQuotation />;
}

function NewQuotation() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const search = useSearch({ from: "/_authenticated/quotations/new" });

  const { data: projects, isLoading: loadingProjects } = useQuery({
    queryKey: ["projects-selectable"],
    queryFn: async () => (await getSupabase().from("projects").select("id, code, name, department_id").is("archived_at", null).order("created_at", { ascending: false })).data ?? [],
  });
  const { data: depts } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await getSupabase().from("departments").select("id, name_th").eq("is_active", true).order("name_th")).data ?? [],
  });
  const [partnerOpen, setPartnerOpen] = useState(false);
  const { data: partners } = useQuery({
    queryKey: ["partners-active", "all"],
    queryFn: async () => (await getSupabase().from("partners").select("id, code, name").eq("status", "active").order("name")).data ?? [],
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: { type: "outgoing", currency: "THB", amount_before_tax: 0, discount: 0, tax: 0, project_id: search.project ?? "" },
  });

  const [scanConfidence, setScanConfidence] = useState<ScannedQuotation["confidence"] | undefined>(undefined);
  const confidence = (key: keyof NonNullable<ScannedQuotation["confidence"]>) => scanConfidence?.[key];

  const amt = Number(form.watch("amount_before_tax")) || 0;
  const disc = Number(form.watch("discount")) || 0;
  const [vatRateId, setVatRateId] = useState<string | undefined>(undefined);
  const { data: vatRates } = useVatRates();
  const selectedVat = pickVatRate(vatRates, vatRateId);
  const netBeforeVat = Math.max(0, amt - disc);
  const { pct: vatPercent, vatAmount: tax, total } = calcVat(netBeforeVat, selectedVat ? Number(selectedVat.rate) : 0);
  const selectedProjectId = form.watch("project_id");

  const create = useMutation({
    mutationFn: async (values: FormValues) => {
      const sb = getSupabase();
      const { data: user } = await sb.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");
      const payload = {
        title: values.title,
        type: values.type,
        project_id: values.project_id,
        partner_id: values.partner_id,
        department_id: values.department_id || null,
        issue_date: values.issue_date || null,
        expiry_date: values.expiry_date || null,
        amount_before_tax: values.amount_before_tax,
        discount: values.discount,
        tax,
        vat_rate: selectedVat ? Number(selectedVat.rate) : 0,
        total_amount: total,
        currency: values.currency,
        description: values.description || null,
        notes: values.notes || null,
        owner_id: user.user.id,
        status: "draft" as const,
      };
      const { data, error } = await sb.from("quotations").insert(payload).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["quotations"] });
      toast.success("เพิ่มใบเสนอราคาสำเร็จ");
      navigate({ to: "/quotations/$id", params: { id: row.id } });
    },
    onError: (e: Error) => toast.error("ไม่สำเร็จ", { description: e.message }),
  });

  // Workflow gate: must have projects first
  if (!loadingProjects && (!projects || projects.length === 0)) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="เพิ่มใบเสนอราคา" description="ตาม workflow ต้องสร้างโครงการก่อน" />
        <EmptyState
          icon={FolderKanban}
          title="ยังไม่มีโครงการในระบบ"
          description="ใบเสนอราคาต้องผูกกับโครงการเสมอ กรุณาสร้างโครงการก่อน"
          action={<Button asChild><Link to="/projects/new">สร้างโครงการ</Link></Button>}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title="เพิ่มใบเสนอราคา" description="ใบเสนอราคาผูกกับโครงการ — ระบบจะสร้างเลขที่อัตโนมัติ" />
      <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-6">
        <ScanQuotationCard
          onScanned={(d) => {
            setScanConfidence(d.confidence);
            if (d.title) form.setValue("title", d.title, { shouldValidate: true });
            if (d.issue_date) form.setValue("issue_date", d.issue_date);
            if (d.expiry_date) form.setValue("expiry_date", d.expiry_date);
            if (d.currency) form.setValue("currency", d.currency);
            if (d.description) form.setValue("description", d.description);
            if (d.amount_before_tax != null) form.setValue("amount_before_tax", Number(d.amount_before_tax));
            if (d.discount != null) form.setValue("discount", Number(d.discount));
            if (d.partner_name) {
              const hit = partners?.find((x: { id: string; name: string }) =>
                x.name.toLowerCase().includes(d.partner_name!.toLowerCase()) ||
                d.partner_name!.toLowerCase().includes(x.name.toLowerCase()),
              );
              if (hit) form.setValue("partner_id", hit.id, { shouldValidate: true });
            }
          }}
        />

        <Card>
          <CardHeader><CardTitle>โครงการที่เกี่ยวข้อง</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Label>โครงการ *</Label>
            <Select value={selectedProjectId || undefined} onValueChange={(v) => {
              form.setValue("project_id", v, { shouldValidate: true });
              const p = projects?.find((x: { id: string; department_id: string | null }) => x.id === v);
              if (p?.department_id) form.setValue("department_id", p.department_id);
            }}>
              <SelectTrigger><SelectValue placeholder="เลือกโครงการ" /></SelectTrigger>
              <SelectContent>
                {projects?.map((p: { id: string; code: string | null; name: string }) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="font-mono text-xs text-muted-foreground mr-2">{p.code ?? "-"}</span>{p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.project_id && <p className="text-xs text-destructive">{form.formState.errors.project_id.message}</p>}
            <p className="text-xs text-muted-foreground">ใบเสนอราคาทุกใบต้องระบุโครงการที่เกี่ยวข้อง เพื่อความสามารถในการติดตามและรายงาน</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>ข้อมูลใบเสนอราคา</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-2">
              <Label>
                หัวข้อ *
                <FieldConfidence score={confidence("title")} />
              </Label>
              <Input {...form.register("title")} />
              {form.formState.errors.title && <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>ประเภท *</Label>
              <Select defaultValue="outgoing" onValueChange={(v) => form.setValue("type", v as never)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="outgoing">ขาออก (ถึงลูกค้า)</SelectItem>
                  <SelectItem value="incoming">ขาเข้า (จากผู้ขาย)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                คู่ค้า / ลูกค้า *
                <FieldConfidence score={confidence("partner_name")} />
              </Label>
              <div className="flex gap-2">
                <Select value={form.watch("partner_id") || undefined} onValueChange={(v) => form.setValue("partner_id", v, { shouldValidate: true })}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="เลือกจากฐานข้อมูลคู่ค้า" /></SelectTrigger>
                  <SelectContent>{partners?.map((p: { id: string; code: string; name: string }) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="mr-2 font-mono text-xs text-muted-foreground">{p.code}</span>{p.name}
                    </SelectItem>
                  ))}</SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" onClick={() => setPartnerOpen(true)} aria-label="เพิ่มคู่ค้าใหม่">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <PartnerFormDialog
                open={partnerOpen}
                onOpenChange={setPartnerOpen}
                onSaved={(row) => form.setValue("partner_id", row.id, { shouldValidate: true })}
              />
              {form.formState.errors.partner_id && <p className="text-xs text-destructive">{form.formState.errors.partner_id.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>แผนก</Label>
              <Select value={form.watch("department_id") || undefined} onValueChange={(v) => form.setValue("department_id", v)}>
                <SelectTrigger><SelectValue placeholder="ไม่ระบุ" /></SelectTrigger>
                <SelectContent>{depts?.map((d: { id: string; name_th: string }) => <SelectItem key={d.id} value={d.id}>{d.name_th}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>วันที่ออก<FieldConfidence score={confidence("issue_date")} /></Label><Input type="date" {...form.register("issue_date")} /></div>
            <div className="space-y-2"><Label>วันหมดอายุ<FieldConfidence score={confidence("expiry_date")} /></Label><Input type="date" {...form.register("expiry_date")} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>มูลค่า</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-2"><Label>มูลค่าก่อน VAT<FieldConfidence score={confidence("amount_before_tax")} /></Label><Input type="number" step="0.01" min="0" {...form.register("amount_before_tax")} /></div>
            <div className="space-y-2"><Label>ส่วนลด<FieldConfidence score={confidence("discount")} /></Label><Input type="number" step="0.01" min="0" {...form.register("discount")} /></div>
            <div className="space-y-2">
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
            <div className="space-y-2">
              <Label>สกุลเงิน<FieldConfidence score={confidence("currency")} /></Label>
              <Select defaultValue="THB" onValueChange={(v) => form.setValue("currency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="THB">THB</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-4 flex flex-wrap justify-end gap-4 border-t pt-3 text-sm">
              <span className="text-muted-foreground tabular-nums">ก่อน VAT: {netBeforeVat.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
              <span className="text-muted-foreground tabular-nums">VAT {vatPercent.toFixed(2)}%: {tax.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
              <span className="text-sm text-muted-foreground">ยอดสุทธิ:</span>
              <span className="text-lg font-semibold tabular-nums">{total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>รายละเอียด</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-2"><Label>รายละเอียด<FieldConfidence score={confidence("description")} /></Label><Textarea rows={3} {...form.register("description")} /></div>
            <div className="space-y-2"><Label>หมายเหตุ</Label><Textarea rows={2} {...form.register("notes")} /></div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/quotations" })}>ยกเลิก</Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}บันทึก
          </Button>
        </div>
      </form>
    </div>
  );
}
