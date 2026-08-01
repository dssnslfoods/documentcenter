import { Building2, ChevronsUpDown, Check, LifeBuoy, ShieldCheck, Lock } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsPlatformOwner, useMyOrg, useOrganizations, useSwitchOrg } from "@/lib/org";
import { useAllSupportAccess, isSupportActive } from "@/lib/support-access";

/**
 * กล่องสลับโหมด/องค์กรบน side menu
 * - ผู้ใช้ทั่วไป: แสดงชื่อองค์กรที่สังกัด
 * - ผู้ดูแลแพลตฟอร์ม: เลือกได้ระหว่าง "โหมดผู้ดูแลแพลตฟอร์ม" และองค์กรที่เปิดสิทธิ์สนับสนุนให้
 */
export function OrgSwitcher({ collapsed }: { collapsed: boolean }) {
  const { isPlatformOwner } = useIsPlatformOwner();
  const { data: myOrg } = useMyOrg();
  const { data: orgs } = useOrganizations(isPlatformOwner);
  const { data: supportRows } = useAllSupportAccess(isPlatformOwner);
  const switchOrg = useSwitchOrg();
  const navigate = useNavigate();

  if (!isPlatformOwner) {
    if (collapsed || !myOrg?.org) return null;
    return (
      <div className="mx-2 mt-2 flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-1.5">
        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-xs font-medium">{myOrg.org.name}</span>
      </div>
    );
  }

  const activeId = myOrg?.activeId ?? null;
  const supportById = new Map((supportRows ?? []).map((r) => [r.organization_id, r]));
  const allowed = (orgs ?? []).filter((o) => isSupportActive(supportById.get(o.id)));
  const others = (orgs ?? []).filter((o) => !isSupportActive(supportById.get(o.id)));

  const label = activeId ? myOrg?.org?.name ?? "องค์กร" : "โหมดผู้ดูแลแพลตฟอร์ม";

  const goPlatform = () =>
    switchOrg.mutate(null, {
      onSuccess: () => {
        toast.success("กลับสู่โหมดผู้ดูแลแพลตฟอร์ม");
        navigate({ to: "/platform" });
      },
      onError: (e: Error) => toast.error(e.message),
    });

  const goOrg = (id: string, name: string) =>
    switchOrg.mutate(id, {
      onSuccess: () => {
        toast.success(`เข้าโหมดสนับสนุน: ${name}`);
        navigate({ to: "/dashboard" });
      },
      onError: (e: Error) => toast.error(e.message),
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`mx-2 mt-2 flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors ${
            activeId
              ? "border-warning/40 bg-warning/10 hover:bg-warning/20"
              : "border-sidebar-border bg-sidebar-accent/40 hover:bg-sidebar-accent"
          } ${collapsed ? "justify-center" : "w-[calc(100%-1rem)]"}`}
          title={label}
        >
          {activeId ? (
            <LifeBuoy className="h-3.5 w-3.5 shrink-0 text-warning" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
          )}
          {!collapsed && (
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-xs font-medium">{label}</span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {activeId ? "โหมดสนับสนุน" : "แพลตฟอร์ม"}
              </span>
            </span>
          )}
          {!collapsed && <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs">สลับโหมดการใช้งาน</DropdownMenuLabel>
        <DropdownMenuItem onSelect={goPlatform}>
          <ShieldCheck className="mr-2 h-4 w-4" />
          <span className="flex-1 truncate">ผู้ดูแลแพลตฟอร์ม</span>
          {!activeId && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs">องค์กรที่เปิดสิทธิ์สนับสนุน</DropdownMenuLabel>
        {allowed.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">ยังไม่มีองค์กรที่เชิญคุณเข้าช่วยสนับสนุน</div>
        )}
        {allowed.map((o) => (
          <DropdownMenuItem key={o.id} onSelect={() => goOrg(o.id, o.name)}>
            <LifeBuoy className="mr-2 h-4 w-4 text-warning" />
            <span className="flex-1 truncate">{o.name}</span>
            {activeId === o.id && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}

        {others.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">ยังไม่เปิดสิทธิ์</DropdownMenuLabel>
            {others.slice(0, 6).map((o) => (
              <DropdownMenuItem key={o.id} disabled className="opacity-60">
                <Lock className="mr-2 h-4 w-4" />
                <span className="truncate">{o.name}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
