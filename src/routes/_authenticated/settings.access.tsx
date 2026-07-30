import { createFileRoute } from "@tanstack/react-router";
import { Fragment } from "react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SettingsNav } from "@/components/settings-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getSupabase } from "@/lib/supabase";
import { useAdminGuard } from "@/hooks/use-admin-guard";
import { useAccessMatrix } from "@/hooks/use-page-access";
import { PAGES, ROLES, defaultAllowed, type PageKey } from "@/lib/pages";
import type { AppRole } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/settings/access")({
  head: () => ({ meta: [{ title: "สิทธิ์เมนู | ตั้งค่าระบบ" }] }),
  component: AccessSettings,
});

type Matrix = Record<string, boolean>; // `${role}:${pageKey}`

function AccessSettings() {
  const guard = useAdminGuard();
  const qc = useQueryClient();
  const { data, isLoading } = useAccessMatrix();
  const [matrix, setMatrix] = useState<Matrix>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next: Matrix = {};
    for (const role of ROLES) {
      for (const page of PAGES) {
        const row = data?.rows.find((r) => r.role === role.value && r.page_key === page.key);
        next[`${role.value}:${page.key}`] = row ? row.allowed : defaultAllowed(role.value, page.key);
      }
    }
    setMatrix(next);
  }, [data]);

  if (!guard.allowed) return guard.node;

  const missing = data?.missing;

  const save = async () => {
    setSaving(true);
    const payload = ROLES.flatMap((role) =>
      PAGES.map((page) => ({
        role: role.value as AppRole,
        page_key: page.key as PageKey,
        allowed: !!matrix[`${role.value}:${page.key}`],
        updated_at: new Date().toISOString(),
      })),
    );
    const { error } = await getSupabase()
      .from("role_page_access")
      .upsert(payload, { onConflict: "role,page_key" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("บันทึกสิทธิ์เมนูเรียบร้อย");
    qc.invalidateQueries({ queryKey: ["role-page-access"] });
  };

  const groups = Array.from(new Set(PAGES.map((p) => p.group)));

  return (
    <div className="space-y-6">
      <PageHeader
        title="สิทธิ์เมนู"
        description="กำหนดว่าบทบาทผู้ใช้แต่ละระดับเข้าถึงเมนู/หน้าใดได้บ้าง"
        actions={
          <Button onClick={save} disabled={saving || !!missing}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            บันทึกสิทธิ์
          </Button>
        }
      />
      <SettingsNav />

      {missing && (
        <Alert variant="destructive">
          <AlertTitle>ยังไม่ได้สร้างตารางสิทธิ์เมนู</AlertTitle>
          <AlertDescription>
            กรุณารันไฟล์ <code className="font-mono">db/0023_role_page_access.sql</code> ใน SQL Editor ของ Supabase ก่อน
            ระหว่างนี้ระบบจะใช้ค่าเริ่มต้น (คลังเอกสารและสัญญาเปิดให้ระดับผู้จัดการขึ้นไป)
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">ตารางสิทธิ์การเข้าถึง</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-muted/60" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">เมนู / หน้า</th>
                    {ROLES.map((r) => (
                      <th key={r.value} className="px-4 py-3 text-center font-medium">{r.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <Fragment key={g}>
                      <tr className="bg-muted/20">
                        <td colSpan={ROLES.length + 1} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g}</td>
                      </tr>
                      {PAGES.filter((p) => p.group === g).map((p) => (
                        <tr key={p.key} className="border-b last:border-0">
                          <td className="px-4 py-3 font-medium">{p.label}</td>
                          {ROLES.map((r) => {
                            const k = `${r.value}:${p.key}`;
                            const locked = r.value === "super_admin";
                            return (
                              <td key={k} className="px-4 py-3 text-center">
                                <Switch
                                  checked={locked ? true : !!matrix[k]}
                                  disabled={locked}
                                  onCheckedChange={(v) => setMatrix((m) => ({ ...m, [k]: v }))}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
