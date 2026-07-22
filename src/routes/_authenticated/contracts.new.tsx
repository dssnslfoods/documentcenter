import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Truck, Receipt, LinkIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabase } from "@/lib/supabase";
import { fmtCurrency } from "@/lib/format";

const milestoneSchema = z.object({
  name: z.string().trim().min(1, "กรุณากรอกชื่องวด").max(200),
  due_date: z.string().optional().or(z.literal("")),
  amount: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  notes: z.string().optional(),
});

const schema = z.object({
  title: z.string().trim().min(1, "กรุณากรอกชื่อสัญญา").max(200),
  contract_type: z.string().optional(),
  partner_id: z.string().uuid("กรุณาเลือกคู่สัญญา"),
  department_id: z.string().uuid("กรุณาเลือกแผนก"),
  sign_date: z.string().optional().or(z.literal("")),
  start_date: z.string().min(1, "กรุณาระบุวันเริ่มมีผล"),
  end_date: z.string().min(1, "กรุณาระบุวันสิ้นสุด"),
  notice_days: z.coerce.number().int().min(0).optional(),
  auto_renewal: z.boolean().default(false),
  value_amount: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  currency: z.string().default("THB"),
  payment_terms: z.string().optional(),
  key_terms: z.string().optional(),
  notes: z.string().optional(),
  deliveries: z.array(milestoneSchema).default([]),
  billings: z.array(milestoneSchema).default([]),
  attachment_links: z.array(z.object({
    label: z.string().trim().min(1, "กรุณากรอกชื่อเอกสาร").max(200),
    url: z.string().trim().url("ลิงก์ไม่ถูกต้อง (ต้องเป็น URL เต็ม เช่น https://...)"),
  })).default([]),
}).refine((v) => new Date(v.end_date) >= new Date(v.start_date), { path: ["end_date"], message: "วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่ม" });

type FormValues = z.infer<typeof schema>;

export const Route = createFileRoute("/_authenticated/contracts/new")({
  head: () => ({ meta: [{ title: "เพิ่มสัญญาใหม่ | Document Hub" }] }),
  component: NewContract,
});

function NewContract() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: depts } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await getSupabase().from("departments").select("id, name_th").eq("is_active", true).order("name_th")).data ?? [],
  });
  const { data: partners } = useQuery({
    queryKey: ["partners-active"],
    queryFn: async () => (await getSupabase().from("partners").select("id, name").eq("status", "active").order("name")).data ?? [],
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: { currency: "THB", auto_renewal: false, notice_days: 30, deliveries: [], billings: [], attachment_links: [] },
  });

  const deliveries = useFieldArray({ control: form.control, name: "deliveries" });
  const billings = useFieldArray({ control: form.control, name: "billings" });
  const links = useFieldArray({ control: form.control, name: "attachment_links" });

  const watchDeliveries = form.watch("deliveries");
  const watchBillings = form.watch("billings");
  const watchCurrency = form.watch("currency") || "THB";
  const sumBillings = (watchBillings ?? []).reduce((s, m) => s + (Number(m.amount) || 0), 0);

  const create = useMutation({
    mutationFn: async (values: FormValues) => {
      const sb = getSupabase();
      const { data: user } = await sb.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");
      const payload = {
        title: values.title,
        contract_type: values.contract_type || null,
        partner_id: values.partner_id,
        department_id: values.department_id,
        sign_date: values.sign_date || null,
        start_date: values.start_date,
        end_date: values.end_date,
        notice_days: values.notice_days ?? 30,
        auto_renewal: values.auto_renewal,
        value_amount: values.value_amount === "" || values.value_amount == null ? null : Number(values.value_amount),
        currency: values.currency || "THB",
        payment_terms: values.payment_terms || null,
        key_terms: values.key_terms || null,
        notes: values.notes || null,
        owner_id: user.user.id,
        created_by: user.user.id,
        status: "draft" as const,
        attachment_links: values.attachment_links ?? [],
      };
      const { data, error } = await sb.from("contracts").insert(payload).select("id").single();
      if (error) throw error;

      const rows = [
        ...values.deliveries.map((m, i) => ({
          contract_id: data.id, kind: "delivery", sort_order: i,
          name: m.name, due_date: m.due_date || null,
          amount: m.amount === "" || m.amount == null ? null : Number(m.amount),
          notes: m.notes || null,
        })),
        ...values.billings.map((m, i) => ({
          contract_id: data.id, kind: "billing", sort_order: i,
          name: m.name, due_date: m.due_date || null,
          amount: m.amount === "" || m.amount == null ? null : Number(m.amount),
          notes: m.notes || null,
        })),
      ];
      if (rows.length > 0) {
        const { error: mErr } = await sb.from("contract_milestones").insert(rows);
        if (mErr) throw mErr;
      }
      return data;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
      toast.success("เพิ่มสัญญาสำเร็จ");
      navigate({ to: "/contracts/$id", params: { id: row.id } });
    },
    onError: (e: Error) => toast.error("เพิ่มสัญญาไม่สำเร็จ", { description: e.message }),
  });

  return (
    <div className="max-w-4xl">
      <PageHeader title="เพิ่มสัญญาใหม่" description="กรอกข้อมูลสัญญา เลขที่สัญญาจะถูกสร้างอัตโนมัติ" />
      <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>ข้อมูลสัญญา</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-2">
              <Label>ชื่อสัญญา *</Label>
              <Input {...form.register("title")} />
              {form.formState.errors.title && <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>ประเภทสัญญา</Label>
              <Input placeholder="เช่น สัญญาบริการ, สัญญาจ้าง, NDA" {...form.register("contract_type")} />
            </div>
            <div className="space-y-2">
              <Label>คู่สัญญา *</Label>
              <Select onValueChange={(v) => form.setValue("partner_id", v)}>
                <SelectTrigger><SelectValue placeholder="เลือกคู่สัญญา" /></SelectTrigger>
                <SelectContent>
                  {partners?.map((p: { id: string; name: string }) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.formState.errors.partner_id && <p className="text-xs text-destructive">{form.formState.errors.partner_id.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>แผนกเจ้าของ *</Label>
              <Select onValueChange={(v) => form.setValue("department_id", v)}>
                <SelectTrigger><SelectValue placeholder="เลือกแผนก" /></SelectTrigger>
                <SelectContent>
                  {depts?.map((d: { id: string; name_th: string }) => <SelectItem key={d.id} value={d.id}>{d.name_th}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.formState.errors.department_id && <p className="text-xs text-destructive">{form.formState.errors.department_id.message}</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>ระยะเวลาและมูลค่า</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2"><Label>วันลงนาม</Label><Input type="date" {...form.register("sign_date")} /></div>
            <div className="space-y-2">
              <Label>วันเริ่มมีผล *</Label>
              <Input type="date" {...form.register("start_date")} />
              {form.formState.errors.start_date && <p className="text-xs text-destructive">{form.formState.errors.start_date.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>วันสิ้นสุด *</Label>
              <Input type="date" {...form.register("end_date")} />
              {form.formState.errors.end_date && <p className="text-xs text-destructive">{form.formState.errors.end_date.message}</p>}
            </div>
            <div className="space-y-2"><Label>แจ้งเตือนล่วงหน้า (วัน)</Label><Input type="number" min="0" {...form.register("notice_days")} /></div>
            <div className="space-y-2"><Label>มูลค่า</Label><Input type="number" step="0.01" min="0" {...form.register("value_amount")} /></div>
            <div className="space-y-2">
              <Label>สกุลเงิน</Label>
              <Select defaultValue="THB" onValueChange={(v) => form.setValue("currency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="THB">THB</SelectItem><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-3 flex items-center gap-2">
              <input type="checkbox" id="auto_renewal" {...form.register("auto_renewal")} className="h-4 w-4" />
              <Label htmlFor="auto_renewal" className="cursor-pointer">ต่ออายุอัตโนมัติ (Auto Renewal)</Label>
            </div>
          </CardContent>
        </Card>

        <MilestoneCard
          title="งวดส่งงาน"
          description="กำหนดงวดการส่งมอบงานตามสัญญา เพิ่มได้อิสระ"
          icon={Truck}
          fields={deliveries.fields}
          onAdd={() => deliveries.append({ name: "", due_date: "", amount: "", notes: "" })}
          onRemove={(i) => deliveries.remove(i)}
          register={form.register}
          fieldName="deliveries"
          amountLabel="มูลค่างวด"
          nameLabel="รายละเอียดงวดส่งงาน"
        />

        <MilestoneCard
          title="การเรียกเก็บเงิน"
          description="กำหนดงวดการเรียกเก็บเงิน / การชำระเงินตามสัญญา"
          icon={Receipt}
          fields={billings.fields}
          onAdd={() => billings.append({ name: "", due_date: "", amount: "", notes: "" })}
          onRemove={(i) => billings.remove(i)}
          register={form.register}
          fieldName="billings"
          amountLabel="จำนวนเงินที่เรียกเก็บ"
          nameLabel="รายละเอียดการเรียกเก็บ"
          footer={
            (watchBillings?.length ?? 0) > 0 ? (
              <div className="flex justify-end text-sm">
                <span className="text-muted-foreground">รวมยอดเรียกเก็บ:&nbsp;</span>
                <span className="font-semibold">{fmtCurrency(sumBillings, watchCurrency)}</span>
              </div>
            ) : null
          }
        />

        {(watchDeliveries?.length ?? 0) > 0 && (watchBillings?.length ?? 0) > 0 && (
          <p className="text-xs text-muted-foreground">
            เพิ่มงวดส่งงาน {watchDeliveries.length} งวด · งวดเรียกเก็บ {watchBillings.length} งวด
          </p>
        )}

        <Card>
          <CardHeader><CardTitle>เงื่อนไขและหมายเหตุ</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-2"><Label>เงื่อนไขการชำระเงิน</Label><Textarea rows={2} {...form.register("payment_terms")} /></div>
            <div className="space-y-2"><Label>เงื่อนไขสำคัญ (Key Terms)</Label><Textarea rows={3} {...form.register("key_terms")} /></div>
            <div className="space-y-2"><Label>หมายเหตุ</Label><Textarea rows={2} {...form.register("notes")} /></div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/contracts" })}>ยกเลิก</Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}บันทึกสัญญา
          </Button>
        </div>
      </form>
    </div>
  );
}

type RHFRegister = ReturnType<typeof useForm<FormValues>>["register"];

function MilestoneCard({
  title, description, icon: Icon, fields, onAdd, onRemove, register, fieldName, amountLabel, nameLabel, footer,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  fields: { id: string }[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  register: RHFRegister;
  fieldName: "deliveries" | "billings";
  amountLabel: string;
  nameLabel: string;
  footer?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2"><Icon className="h-4 w-4" />{title}</CardTitle>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onAdd}>
          <Plus className="mr-1 h-4 w-4" />เพิ่มงวด
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {fields.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">ยังไม่มีรายการ กด "เพิ่มงวด" เพื่อเริ่มต้น</p>
        )}
        {fields.map((f, i) => (
          <div key={f.id} className="rounded-md border p-3 space-y-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">งวดที่ {i + 1}</span>
              <Button type="button" size="icon" variant="ghost" onClick={() => onRemove(i)} className="h-7 w-7">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-6">
              <div className="sm:col-span-3 space-y-1">
                <Label className="text-xs">{nameLabel} *</Label>
                <Input {...register(`${fieldName}.${i}.name` as const)} placeholder="เช่น งวดที่ 1 - ส่งมอบเอกสารตั้งต้น" />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs">วันครบกำหนด</Label>
                <Input type="date" {...register(`${fieldName}.${i}.due_date` as const)} />
              </div>
              <div className="sm:col-span-1 space-y-1">
                <Label className="text-xs">{amountLabel}</Label>
                <Input type="number" step="0.01" min="0" {...register(`${fieldName}.${i}.amount` as const)} />
              </div>
              <div className="sm:col-span-6 space-y-1">
                <Label className="text-xs">หมายเหตุ</Label>
                <Input {...register(`${fieldName}.${i}.notes` as const)} placeholder="เงื่อนไข / เอกสารประกอบ" />
              </div>
            </div>
          </div>
        ))}
        {footer}
      </CardContent>
    </Card>
  );
}
