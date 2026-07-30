import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSupabase } from "@/lib/supabase";
import { nextCode } from "@/lib/next-code";

const schema = z.object({
  name: z.string().trim().min(1, "กรุณากรอกชื่อโครงการ").max(200),
  description: z.string().optional(),
  customer_name: z.string().trim().optional(),
  project_type: z.string().trim().min(1, "กรุณาเลือกประเภทงาน"),
  start_date: z.string().optional().or(z.literal("")),
  end_date: z.string().optional().or(z.literal("")),
  contract_value: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  budget: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  is_inhouse: z.boolean().optional(),

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
  const [wtName, setWtName] = useState("");

  const { data: workTypes } = useQuery({
    queryKey: ["work-types"],
    queryFn: async () => (await getSupabase().from("work_types").select("id, code, name_th").eq("is_active", true).order("sort_order").order("name_th")).data ?? [],
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

  const create = useMutation({
    mutationFn: async (values: FormValues) => {
      const sb = getSupabase();
      const { data: user } = await sb.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");
      const payload = {
        name: values.name,
        description: values.description || null,
        customer_name: values.customer_name || null,
        project_type: values.project_type || null,
        start_date: values.start_date || null,
        end_date: values.end_date || null,
        contract_value: values.contract_value === "" || values.contract_value == null ? null : Number(values.contract_value),
        is_inhouse: !!values.is_inhouse,
        status: "draft",

        owner_id: user.user.id,
        created_by: user.user.id,
      };
      const { data, error } = await sb.from("projects").insert(payload).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("เพิ่มโครงการสำเร็จ");
      navigate({ to: "/projects/$id", params: { id: row.id } });
    },
    onError: (e: Error) => toast.error("เพิ่มโครงการไม่สำเร็จ", { description: e.message }),
  });

  return (
    <div className="max-w-3xl">
      <PageHeader title="เพิ่มโครงการใหม่" description="รหัสจะถูกสร้างอัตโนมัติ (PRJ-YYYY-NNNN) — โครงการจะเริ่มที่สถานะ 'ร่าง'" />
      <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-6">
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
              <Input placeholder="ชื่อลูกค้า/หน่วยงาน" {...form.register("customer_name")} />
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
            <div className="space-y-2"><Label>มูลค่าสัญญา (บาท)</Label><Input type="number" step="0.01" min="0" {...form.register("contract_value")} /></div>

          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/projects" })}>ยกเลิก</Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}บันทึกโครงการ
          </Button>
        </div>
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
