import { Building2, ChevronsUpDown, Globe2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsPlatformOwner, useMyOrg, useOrganizations, useSwitchOrg } from "@/lib/org";

/** แสดงองค์กรปัจจุบัน — ผู้ดูแลแพลตฟอร์มสลับองค์กรได้จากที่นี่ */
export function OrgSwitcher({ collapsed }: { collapsed: boolean }) {
  const { isPlatformOwner } = useIsPlatformOwner();
  const { data: myOrg } = useMyOrg();
  const { data: orgs } = useOrganizations(isPlatformOwner);
  const switchOrg = useSwitchOrg();

  const label = myOrg?.activeId ? myOrg.org?.name ?? "องค์กร" : "ทุกองค์กร";

  if (!isPlatformOwner) {
    if (collapsed || !myOrg?.org) return null;
    return (
      <div className="mx-2 mt-2 flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-1.5">
        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-xs font-medium">{myOrg.org.name}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`mx-2 mt-2 flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-1.5 transition-colors hover:bg-sidebar-accent ${
            collapsed ? "justify-center" : "w-[calc(100%-1rem)]"
          }`}
          title={label}
        >
          {myOrg?.activeId ? (
            <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Globe2 className="h-3.5 w-3.5 shrink-0 text-primary" />
          )}
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-left text-xs font-medium">{label}</span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-xs">สลับองค์กร</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() => switchOrg.mutate(null, { onSuccess: () => toast.success("มุมมองทุกองค์กร") })}
        >
          <Globe2 className="mr-2 h-4 w-4" />ทุกองค์กร (แพลตฟอร์ม)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {(orgs ?? []).map((o) => (
          <DropdownMenuItem
            key={o.id}
            onSelect={() => switchOrg.mutate(o.id, { onSuccess: () => toast.success(`สลับไปยัง ${o.name}`) })}
          >
            <Building2 className="mr-2 h-4 w-4" />
            <span className="truncate">{o.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
