import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/page-header";
import { PlatformGuard, PlatformNav } from "@/components/platform-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { useOrganizations } from "@/lib/org";
import { PAGES } from "@/lib/pages";
import { ORG_PAGE_KEYS, useAllOrgPageAccess, useSetOrgPageAccess } from "@/lib/org-access";

export const Route = createFileRoute("/_authenticated/platform/menus")({
  head: () => ({
    meta: [
      { title: "ผู้ดูแลแพลตฟอร์ม · เมนูขององค์กร | Document Hub" },
      { name: "description", content: "เปิด/ปิดเมนูและฟีเจอร์ที่แต่ละองค์กรใช้งานได้" },
      { property: "og:title", content: "เมนูขององค์กร" },
      { property: "og:description", content: "เปิด/ปิดเมนูและฟีเจอร์ที่แต่ละองค์กรใช้งานได้" },
    ],
  }),
  component: () => (
    <PlatformGuard title="เมนูขององค์กร">
      <OrgMenusPage />
    </PlatformGuard>
  ),
});

function OrgMenusPage() {
  const { data: orgs, isLoading } = useOrganizations(true);
  const { data: rows } = useAllOrgPageAccess(true);
  const setAccess = useSetOrgPageAccess();
  const [orgId, setOrgId] = useState<string>("");

  const selected = orgId || orgs?.[0]?.id || "";
  const enabledOf = (key: string) => {
    const row = rows?.find((r) => r.organization_id === selected && r.page_key === key);
    return row ? row.enabled : true;
  };

  const toggle = (key: string, value: boolean) => {
    if (!selected) return;
    setAccess.mutate(
      { organizationId: selected, pageKey: key, enabled: value },
      {
        onSuccess: () => toast.success(value ? "เปิดเมนูให้องค์กรแล้ว" : "ปิดเมนูขององค์กรแล้ว"),
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  const setAll = (value: boolean) => {
    ORG_PAGE_KEYS.forEach((k) => setAccess.mutate({ organizationId: selected, pageKey: k, enabled: value }));
    toast.success(value ? "เปิดทุกเมนูแล้ว" : "ปิดทุกเมนูแล้ว");
  };

  const groups = Array.from(new Set(PAGES.filter((p) => ORG_PAGE_KEYS.includes(p.key)).map((p) => p.group)));

  return (
    <div className="space-y-6">
      <PageHeader
        title="เมนูขององค์กร"
        description="กำหนดว่าองค์กรใดใช้งานเมนู/ฟีเจอร์ใดได้บ้าง — สิทธิ์ระดับบทบาทภายในองค์กรยังคงถูกกำหนดโดยผู้ดูแลองค์กร"
      />
      <PlatformNav />

      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">กำลังโหลด...</div>
      ) : !orgs?.length ? (
        <EmptyState icon={Building2} title="ยังไม่มีองค์กร" description="สร้างองค์กรก่อนจึงจะกำหนดเมนูได้" />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">เลือกองค์กร</Label>
              <Select value={selected} onValueChange={setOrgId}>
                <SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.code} · {o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={() => setAll(true)}>เปิดทั้งหมด</Button>
            <Button variant="outline" size="sm" onClick={() => setAll(false)}>ปิดทั้งหมด</Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {groups.map((g) => (
              <Card key={g}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{g}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {PAGES.filter((p) => p.group === g && ORG_PAGE_KEYS.includes(p.key)).map((p) => (
                    <div key={p.key} className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted/50">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{p.label}</div>
                        <div className="truncate font-mono text-[10px] text-muted-foreground">{p.key}</div>
                      </div>
                      <Switch checked={enabledOf(p.key)} onCheckedChange={(v) => toggle(p.key, v)} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
