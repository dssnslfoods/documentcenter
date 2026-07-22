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
  title: z.string().trim().min(1, "กรุณากรอกชื่อรายการ").max(200),
  procurement_type: z.string().optional(),
  department_id: z.string().uuid("กรุณาเลือกแผนก"),
  procurement_method: z.string().optional(),
  supplier_id: z.string().uuid().optional().or(z.literal("")),
  budget: z.coerce.number().min(0).optional().or(z.literal("")),
  estimated_value: z.coerce.number().min(0).optional().or(z.literal("")),
  request_date: z.string().optional().or(z.literal("")),
  need_date: z.string().optional().or(z.literal("")),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export const Route = createFileRoute("/_authenticated/procurements/new")({
  head: () => ({ meta: [{ title: "เพิ่มคำขอจัดซื้อ | Document Hub" }] }),
  component: NewProcurement,
});

function NewProcurement() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: depts } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await getSupabase().from("departments").select("id, name_th").eq("is_active", true).order("name_th")).data ?? [],
  });
  const { data: suppliers } = useQuery({
    queryKey: ["partners-suppliers"],
    queryFn: async () => (await getSupabase().from("partners").select("id, name, type").in("type", ["supplier", "both"]).eq("status", "active").order("name")).data ?? [],
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: { request_date: new Date().toISOString().slice(0, 10) },
  });

  const create = useMutation({
    mutationFn: async (values: FormValues) => {
      const sb = getSupabase();
      const { data: user } = await sb.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");
      const num = (v: unknown) => v === "" || v == null ? null : Number(v);
      const payload = {
        title: values.title,
        procurement_type: values.procurement_type || null,
        department_id: values.department_id,
        procurement_method: values.procurement_method || null,
        supplier_id: values.supplier_id || null,
        budget: num(values.budget),
        estimated_value: num(values.estimated_value),
        request_date: values.request_date || null,
        need_date: values.need_date || null,
        notes: values.notes || null,
        requester_id: user.user.id,
        owner_id: user.user.id,
        status: "draft" as const,
      };
      const { data, error } = await sb.from("procurements").insert(payload).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["procurements"] });
      toast.success("สร้างคำขอสำเร็จ");
      navigate({ to: "/procurements/$id", params: { id: row.id } });
    },
    onError: (e: Error) => toast.error("ไม่สำเร็จ", { description: e.message }),
  });

  return (
    <div className="max-w-4xl">
      <PageHeader title="เพิ่มคำขอจัดซื้อ" description="สร้างคำขอจัดซื้อจัดจ้างใหม่ ระบบสร้างเลขที่อัตโนมัติ" />
      <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>ข้อมูลคำขอ</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-2">
              <Label>ชื่อรายการ *</Label>
              <Input {...form.register("title")} />
              {form.formState.errors.title && <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>}
            </div>
            <div className="space-y-2"><Label>ประเภท</Label><Input placeholder="เช่น อุปกรณ์ IT, บริการ" {...form.register("procurement_type")} /></div>
            <div className="space-y-2">
              <Label>แผนก *</Label>
              <Select onValueChange={(v) => form.setValue("department_id", v)}>
                <SelectTrigger><SelectValue placeholder="เลือกแผนก" /></SelectTrigger>
                <SelectContent>{depts?.map((d: { id: string; name_th: string }) => <SelectItem key={d.id} value={d.id}>{d.name_th}</SelectItem>)}</SelectContent>
              </Select>
              {form.formState.errors.department_id && <p className="text-xs text-destructive">{form.formState.errors.department_id.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>วิธีจัดซื้อ</Label>
              <Select onValueChange={(v) => form.setValue("procurement_method", v)}>
                <SelectTrigger><SelectValue placeholder="เลือกวิธี" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="วิธีเฉพาะเจาะจง">วิธีเฉพาะเจาะจง</SelectItem>
                  <SelectItem value="เชิญชวนทั่วไป">เชิญชวนทั่วไป</SelectItem>
                  <SelectItem value="เชิญชวนเฉพาะราย">เชิญชวนเฉพาะราย</SelectItem>
                  <SelectItem value="ประมูล e-Bidding">ประมูล e-Bidding</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>ผู้ขาย/ผู้รับจ้าง</Label>
              <Select onValueChange={(v) => form.setValue("supplier_id", v)}>
                <SelectTrigger><SelectValue placeholder="ยังไม่ระบุ" /></SelectTrigger>
                <SelectContent>{suppliers?.map((s: { id: string; name: string }) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>งบประมาณและกำหนดการ</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>งบประมาณ (บาท)</Label><Input type="number" step="0.01" min="0" {...form.register("budget")} /></div>
            <div className="space-y-2"><Label>มูลค่าประเมิน (บาท)</Label><Input type="number" step="0.01" min="0" {...form.register("estimated_value")} /></div>
            <div className="space-y-2"><Label>วันยื่นคำขอ</Label><Input type="date" {...form.register("request_date")} /></div>
            <div className="space-y-2"><Label>วันต้องการรับ</Label><Input type="date" {...form.register("need_date")} /></div>
            <div className="sm:col-span-2 space-y-2"><Label>หมายเหตุ</Label><Textarea rows={3} {...form.register("notes")} /></div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/procurements" })}>ยกเลิก</Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}บันทึกคำขอ
          </Button>
        </div>
      </form>
    </div>
  );
}
