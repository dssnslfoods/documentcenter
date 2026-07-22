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

const schema = z
  .object({
    title: z.string().trim().min(1, "กรุณากรอกชื่อเอกสาร").max(200),
    description: z.string().max(2000).optional(),
    category_id: z.string().uuid("กรุณาเลือกหมวดหมู่"),
    department_id: z.string().uuid("กรุณาเลือกแผนก"),
    partner_id: z.string().uuid().optional().or(z.literal("")),
    issue_date: z.string().optional().or(z.literal("")),
    effective_date: z.string().optional().or(z.literal("")),
    end_date: z.string().optional().or(z.literal("")),
    value_amount: z.coerce.number().min(0, "มูลค่าต้องไม่ติดลบ").optional().or(z.literal("")),
    currency: z.string().default("THB"),
    confidentiality: z.enum(["public", "internal", "confidential", "highly_confidential"]),
    status: z.enum(["draft", "under_review", "active", "approved"]),
    keywords: z.string().max(500).optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (v) => !v.effective_date || !v.end_date || new Date(v.end_date) >= new Date(v.effective_date),
    { path: ["end_date"], message: "วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มมีผล" },
  );

type FormValues = z.infer<typeof schema>;

export const Route = createFileRoute("/_authenticated/documents/new")({
  head: () => ({ meta: [{ title: "เพิ่มเอกสารใหม่ | Document Hub" }] }),
  component: NewDocument,
});

function NewDocument() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: cats } = useQuery({
    queryKey: ["document_categories"],
    queryFn: async () => {
      const { data } = await getSupabase().from("document_categories").select("id, name_th").eq("is_active", true).order("name_th");
      return data ?? [];
    },
  });
  const { data: depts } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data } = await getSupabase().from("departments").select("id, name_th").eq("is_active", true).order("name_th");
      return data ?? [];
    },
  });
  const { data: partners } = useQuery({
    queryKey: ["partners-active"],
    queryFn: async () => {
      const { data } = await getSupabase().from("partners").select("id, name").eq("status", "active").order("name");
      return data ?? [];
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      currency: "THB",
      confidentiality: "internal",
      status: "draft",
    },
  });

  const create = useMutation({
    mutationFn: async (values: FormValues) => {
      const sb = getSupabase();
      const { data: user } = await sb.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      const payload = {
        title: values.title,
        description: values.description || null,
        category_id: values.category_id,
        department_id: values.department_id,
        partner_id: values.partner_id || null,
        issue_date: values.issue_date || null,
        effective_date: values.effective_date || null,
        end_date: values.end_date || null,
        value_amount: values.value_amount === "" || values.value_amount == null ? null : Number(values.value_amount),
        currency: values.currency || "THB",
        confidentiality: values.confidentiality,
        status: values.status,
        keywords: values.keywords || null,
        notes: values.notes || null,
        owner_id: user.user.id,
        created_by: user.user.id,
      };

      const { data, error } = await sb.from("documents").insert(payload).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast.success("เพิ่มเอกสารสำเร็จ");
      navigate({ to: "/documents/$id", params: { id: row.id } });
    },
    onError: (e: Error) => toast.error("เพิ่มเอกสารไม่สำเร็จ", { description: e.message }),
  });

  return (
    <div className="max-w-4xl">
      <PageHeader title="เพิ่มเอกสารใหม่" description="กรอกข้อมูลเอกสาร เลขที่เอกสารจะถูกสร้างอัตโนมัติ" />

      <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>ข้อมูลหลัก</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-2">
              <Label>ชื่อเอกสาร *</Label>
              <Input {...form.register("title")} />
              {form.formState.errors.title && <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>หมวดหมู่ *</Label>
              <Select onValueChange={(v) => form.setValue("category_id", v)}>
                <SelectTrigger><SelectValue placeholder="เลือกหมวดหมู่" /></SelectTrigger>
                <SelectContent>
                  {cats?.map((c: { id: string; name_th: string }) => (
                    <SelectItem key={c.id} value={c.id}>{c.name_th}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.category_id && <p className="text-xs text-destructive">{form.formState.errors.category_id.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>แผนกเจ้าของ *</Label>
              <Select onValueChange={(v) => form.setValue("department_id", v)}>
                <SelectTrigger><SelectValue placeholder="เลือกแผนก" /></SelectTrigger>
                <SelectContent>
                  {depts?.map((d: { id: string; name_th: string }) => (
                    <SelectItem key={d.id} value={d.id}>{d.name_th}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.department_id && <p className="text-xs text-destructive">{form.formState.errors.department_id.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>คู่ค้า / ลูกค้า</Label>
              <Select onValueChange={(v) => form.setValue("partner_id", v)}>
                <SelectTrigger><SelectValue placeholder="ไม่ระบุ" /></SelectTrigger>
                <SelectContent>
                  {partners?.map((p: { id: string; name: string }) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>ระดับความลับ *</Label>
              <Select defaultValue="internal" onValueChange={(v) => form.setValue("confidentiality", v as never)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public ภายในองค์กร</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="confidential">Confidential</SelectItem>
                  <SelectItem value="highly_confidential">Highly Confidential</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-2 space-y-2">
              <Label>คำอธิบาย</Label>
              <Textarea rows={3} {...form.register("description")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>กำหนดการและมูลค่า</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>วันที่ออกเอกสาร</Label>
              <Input type="date" {...form.register("issue_date")} />
            </div>
            <div className="space-y-2">
              <Label>วันเริ่มมีผล</Label>
              <Input type="date" {...form.register("effective_date")} />
            </div>
            <div className="space-y-2">
              <Label>วันสิ้นสุด</Label>
              <Input type="date" {...form.register("end_date")} />
              {form.formState.errors.end_date && <p className="text-xs text-destructive">{form.formState.errors.end_date.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>มูลค่า</Label>
              <Input type="number" step="0.01" min="0" {...form.register("value_amount")} />
              {form.formState.errors.value_amount && <p className="text-xs text-destructive">{form.formState.errors.value_amount.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>สกุลเงิน</Label>
              <Select defaultValue="THB" onValueChange={(v) => form.setValue("currency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="THB">THB</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="JPY">JPY</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>สถานะ</Label>
              <Select defaultValue="draft" onValueChange={(v) => form.setValue("status", v as never)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">ร่าง</SelectItem>
                  <SelectItem value="under_review">กำลังตรวจสอบ</SelectItem>
                  <SelectItem value="active">ใช้งาน</SelectItem>
                  <SelectItem value="approved">อนุมัติแล้ว</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>ค้นหาและหมายเหตุ</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-2">
              <Label>Keywords (ใช้ค้นหา)</Label>
              <Input placeholder="แยกด้วยเครื่องหมาย ," {...form.register("keywords")} />
            </div>
            <div className="space-y-2">
              <Label>หมายเหตุ</Label>
              <Textarea rows={3} {...form.register("notes")} />
            </div>
            <p className="text-xs text-muted-foreground">
              💡 สามารถอัปโหลดไฟล์แนบและจัดการ Version ได้หลังจากบันทึกเอกสารแล้ว
            </p>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/documents" })}>
            ยกเลิก
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            บันทึกเอกสาร
          </Button>
        </div>
      </form>
    </div>
  );
}
