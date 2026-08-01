import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Building2, ShieldCheck, LayoutGrid, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useIsPlatformOwner } from "@/lib/org";

const items = [
  { to: "/platform", label: "องค์กร", icon: Building2, exact: true },
  { to: "/platform/admins", label: "ผู้ดูแลองค์กร", icon: ShieldCheck },
  { to: "/platform/menus", label: "เมนูขององค์กร", icon: LayoutGrid },
];

export function PlatformNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto rounded-lg border bg-card p-1 sm:mx-0 sm:flex-wrap sm:overflow-visible">
      {items.map((it) => {
        const active = it.exact ? pathname === "/platform" || pathname === "/platform/" : pathname.startsWith(it.to);
        return (
          <Link
            key={it.to}
            to={it.to as "/platform"}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <it.icon className="h-4 w-4" />
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}

/** ครอบหน้าในโซนผู้ดูแลแพลตฟอร์ม — อนุญาตเฉพาะ platform_owner */
export function PlatformGuard({ title, children }: { title: string; children: ReactNode }) {
  const { isPlatformOwner, isLoading } = useIsPlatformOwner();

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">กำลังตรวจสอบสิทธิ์...</div>;
  }
  if (!isPlatformOwner) {
    return (
      <div className="space-y-6">
        <PageHeader title={title} description="สำหรับผู้ดูแลแพลตฟอร์มเท่านั้น" />
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>ไม่มีสิทธิ์เข้าถึง</AlertTitle>
          <AlertDescription>เฉพาะผู้ดูแลแพลตฟอร์ม (platform owner) เท่านั้นที่เข้าถึงหน้านี้ได้</AlertDescription>
        </Alert>
      </div>
    );
  }
  return <>{children}</>;
}
