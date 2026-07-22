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
  name: z.string().trim().min(1, "กรุณากรอกชื่อโครงการ").max(200),
  description: z.string().optional(),
  department_id: z.string().uuid("กรุณาเลือกแผนก").optional().or(z.literal("")),
  start_date: z.string().optional().or(z.literal("")),
  end_date: z.string().optional().or(z.literal("")),
  budget: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  status: z.enum(["planning", "active", "on_hold", "completed", "cancelled"]).default("planning"),
  progress: z.coerce.number().int().min(0).max(100).default(0),
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

  const { data: depts } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await getSupabase().from("departments").select("id, name_th").eq("is_active", true).order("name_th")).data ?? [],
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: { status: "planning", progress: 0 },
  });

  const create = useMutation({
    mutationFn: async (values: FormValues) => {
      const sb = getSupabase();
      const { data: user } = await sb.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");
      const payload = {
        name: values.name,
        description: values.description || null,
        department_id: values.department_id || null,
        start_date: values.start_date || null,
        end_date: values.end_date || null,
        budget: values.budget === "" || values.budget == null ? null : Number(values.budget),
        status: values.status,
        progress: values.progress,
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
      <PageHeader title="เพิ่มโครงการใหม่" description="กรอกข้อมูลโครงการ รหัสจะถูกสร้างอัตโนมัติ (PRJ-YYYY-NNNN)" />
      <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>ข้อมูลโครงการ</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-2">
              <Label>ชื่อโครงการ *</Label>
              <Input {...form.register("name")} />
              {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label>รายละเอียด</Label>
              <Textarea rows={3} {...form.register("description")} />
            </div>
            <div className="space-y-2">
              <Label>แผนกเจ้าของ</Label>
              <Select onValueChange={(v) => form.setValue("department_id", v)}>
                <SelectTrigger><SelectValue placeholder="เลือกแผนก" /></SelectTrigger>
                <SelectContent>
                  {depts?.map((d: { id: string; name_th: string }) => <SelectItem key={d.id} value={d.id}>{d.name_th}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>สถานะ</Label>
              <Select defaultValue="planning" onValueChange={(v) => form.setValue("status", v as FormValues["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">วางแผน</SelectItem>
                  <SelectItem value="active">ดำเนินการ</SelectItem>
                  <SelectItem value="on_hold">พักไว้</SelectItem>
                  <SelectItem value="completed">เสร็จสิ้น</SelectItem>
                  <SelectItem value="cancelled">ยกเลิก</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>ระยะเวลาและงบประมาณ</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2"><Label>วันเริ่ม</Label><Input type="date" {...form.register("start_date")} /></div>
            <div className="space-y-2">
              <Label>วันสิ้นสุด</Label>
              <Input type="date" {...form.register("end_date")} />
              {form.formState.errors.end_date && <p className="text-xs text-destructive">{form.formState.errors.end_date.message}</p>}
            </div>
            <div className="space-y-2"><Label>งบประมาณ (บาท)</Label><Input type="number" step="0.01" min="0" {...form.register("budget")} /></div>
            <div className="space-y-2 sm:col-span-3">
              <Label>ความคืบหน้า (%)</Label>
              <Input type="number" min="0" max="100" {...form.register("progress")} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/projects" })}>ยกเลิก</Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}บันทึกโครงการ
          </Button>
        </div>
      </form>
    </div>
  );
}
