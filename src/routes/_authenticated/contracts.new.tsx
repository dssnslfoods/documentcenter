import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabase } from "@/lib/supabase";

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
  value_amount: z.coerce.number().min(0).optional().or(z.literal("")),
  currency: z.string().default("THB"),
  payment_terms: z.string().optional(),
  key_terms: z.string().optional(),
  notes: z.string().optional(),
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
    defaultValues: { currency: "THB", auto_renewal: false, notice_days: 30 },
  });

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
      };
      const { data, error } = await sb.from("contracts").insert(payload).select("id").single();
      if (error) throw error;
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
