import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSupabase } from "@/lib/supabase";
import { useAdminGuard } from "@/hooks/use-admin-guard";

export const Route = createFileRoute("/_authenticated/settings/general")({
  head: () => ({ meta: [{ title: "การตั้งค่าทั่วไป | Document Hub" }] }),
  component: GeneralPage,
});

type Settings = {
  org_name: string;
  org_address: string;
  org_tax_id: string;
  doc_number_format: string;
  project_number_format: string;
  retention_days: string;
};

const DEFAULTS: Settings = {
  org_name: "",
  org_address: "",
  org_tax_id: "",
  doc_number_format: "{PREFIX}-{YYYY}-{NNNN}",
  project_number_format: "PRJ-{YYYY}-{NNNN}",
  retention_days: "2555",
};

function GeneralPage() {
  const guard = useAdminGuard();
  const sb = getSupabase();
  const qc = useQueryClient();
  const [form, setForm] = useState<Settings>(DEFAULTS);

  const { data, isLoading } = useQuery({
    queryKey: ["system-settings"],
    enabled: guard.allowed,
    queryFn: async () => {
      const keys = Object.keys(DEFAULTS);
      const { data, error } = await sb.from("system_settings").select("key, value").in("key", keys);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((r) => {
        const v = r.value;
        map[r.key] = typeof v === "string" ? v : (v?.value ?? JSON.stringify(v));
      });
      return map;
    },
  });

  useEffect(() => {
    if (data) {
      setForm({ ...DEFAULTS, ...(data as Partial<Settings>) });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const rows = Object.entries(form).map(([key, value]) => ({
        key,
        value: value as unknown as object, // jsonb accepts string
        updated_at: new Date().toISOString(),
      }));
      const { error } = await sb.from("system_settings").upsert(rows, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("บันทึกการตั้งค่าแล้ว");
      qc.invalidateQueries({ queryKey: ["system-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (guard.node) return guard.node;

  return (
    <div className="space-y-6">
      <PageHeader
        title="การตั้งค่าทั่วไป"
        description="ข้อมูลองค์กร รูปแบบเลขเอกสาร และนโยบายเก็บรักษาข้อมูล"
        actions={
          <Button onClick={() => save.mutate()} disabled={save.isPending || isLoading}>
            <Save className="h-4 w-4 mr-1" /> บันทึก
          </Button>
        }
      />

      <Card>
        <CardHeader><CardTitle className="text-base">ข้อมูลองค์กร</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>ชื่อองค์กร</Label>
            <Input value={form.org_name} onChange={(e) => setForm({ ...form, org_name: e.target.value })} />
          </div>
          <div>
            <Label>เลขประจำตัวผู้เสียภาษี</Label>
            <Input value={form.org_tax_id} onChange={(e) => setForm({ ...form, org_tax_id: e.target.value })} />
          </div>
          <div />
          <div className="sm:col-span-2">
            <Label>ที่อยู่</Label>
            <Textarea rows={3} value={form.org_address} onChange={(e) => setForm({ ...form, org_address: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">รูปแบบเลขที่เอกสาร</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>รูปแบบเลขเอกสารทั่วไป</Label>
            <Input value={form.doc_number_format} onChange={(e) => setForm({ ...form, doc_number_format: e.target.value })} />
            <p className="text-xs text-muted-foreground mt-1">{`ตัวแปร: {PREFIX}, {YYYY}, {MM}, {NNNN}`}</p>
          </div>
          <div>
            <Label>รูปแบบเลขโครงการ</Label>
            <Input value={form.project_number_format} onChange={(e) => setForm({ ...form, project_number_format: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">นโยบายเก็บรักษา (Retention)</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>ระยะเวลาเก็บเอกสาร (วัน)</Label>
            <Input type="number" value={form.retention_days} onChange={(e) => setForm({ ...form, retention_days: e.target.value })} />
            <p className="text-xs text-muted-foreground mt-1">ค่าเริ่มต้น 2,555 วัน (~7 ปี ตามหลักบัญชี)</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
