import { useEffect, useState } from "react";
import { LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-supabase";
import { useMyRoles } from "@/hooks/use-page-access";
import { isSupportActive, useMySupportAccess, useSetSupportAccess } from "@/lib/support-access";

/** การ์ดสำหรับผู้ดูแลองค์กร (super_admin) เปิด/ปิดสิทธิ์ให้ผู้ดูแลแพลตฟอร์มเข้าช่วยสนับสนุน */
export function SupportAccessCard() {
  const { user } = useAuth();
  const { roles } = useMyRoles();
  const { orgId, row, isLoading } = useMySupportAccess();
  const setAccess = useSetSupportAccess();
  const [enabled, setEnabled] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    setEnabled(row?.enabled ?? false);
    setExpiresAt(row?.expires_at ? row.expires_at.slice(0, 16) : "");
    setNote(row?.note ?? "");
  }, [row]);

  if (!roles.includes("super_admin")) return null;

  const active = isSupportActive(row);

  const save = (nextEnabled: boolean) => {
    if (!orgId) return;
    setAccess.mutate(
      {
        organizationId: orgId,
        enabled: nextEnabled,
        expiresAt: nextEnabled && expiresAt ? new Date(expiresAt).toISOString() : null,
        note: nextEnabled ? note || null : null,
        grantedBy: user?.id ?? null,
      },
      {
        onSuccess: () =>
          toast.success(nextEnabled ? "เปิดสิทธิ์สนับสนุนแล้ว" : "ปิดสิทธิ์สนับสนุนแล้ว"),
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <LifeBuoy className="h-4 w-4" />
          สิทธิ์สนับสนุนโดยผู้ดูแลแพลตฟอร์ม
        </CardTitle>
        {active ? (
          <Badge className="bg-warning/15 text-warning">เปิดอยู่</Badge>
        ) : (
          <Badge variant="secondary">ปิดอยู่</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          เมื่อเปิดสิทธิ์นี้ ผู้ดูแลแพลตฟอร์มจะเข้าใช้งานระบบในนามองค์กรของคุณได้ด้วยสิทธิ์เต็ม
          เพื่อช่วยแก้ปัญหาหรือสนับสนุนการใช้งาน — แนะนำให้กำหนดวันหมดอายุ และปิดเมื่อไม่ใช้งานแล้ว
        </p>

        <div className="flex items-center gap-3 rounded-md border p-3">
          <Switch
            checked={enabled}
            disabled={isLoading || setAccess.isPending}
            onCheckedChange={(v) => {
              setEnabled(v);
              save(v);
            }}
          />
          <span className="text-sm font-medium">อนุญาตให้ผู้ดูแลแพลตฟอร์มเข้าช่วยสนับสนุน</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>สิทธิ์หมดอายุ (ไม่ระบุ = จนกว่าจะปิดเอง)</Label>
            <Input
              type="datetime-local"
              value={expiresAt}
              disabled={!enabled}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>เหตุผล / เรื่องที่ขอความช่วยเหลือ</Label>
            <Textarea rows={2} value={note} disabled={!enabled} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {row?.granted_at ? `เปิดสิทธิ์ล่าสุด: ${new Date(row.granted_at).toLocaleString("th-TH")}` : "ยังไม่เคยเปิดสิทธิ์"}
          </div>
          <Button size="sm" variant="outline" disabled={!enabled || setAccess.isPending} onClick={() => save(true)}>
            บันทึกเงื่อนไข
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
