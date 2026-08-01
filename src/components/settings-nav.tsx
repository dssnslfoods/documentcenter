import { Link, useRouterState } from "@tanstack/react-router";
import { Users, Building2, FolderTree, Tag, Settings as SettingsIcon, LayoutGrid, Briefcase, Percent, ShieldCheck, Network } from "lucide-react";
import { useIsPlatformOwner } from "@/lib/org";

const items: { to: string; label: string; icon: typeof Users; exact?: boolean }[] = [
  { to: "/settings", label: "ภาพรวม", icon: LayoutGrid, exact: true },
  { to: "/settings/users", label: "ผู้ใช้งาน", icon: Users },
  { to: "/settings/access", label: "สิทธิ์เมนู", icon: ShieldCheck },
  { to: "/settings/departments", label: "แผนก", icon: Building2 },
  { to: "/settings/work-types", label: "ประเภทงาน", icon: Briefcase },
  { to: "/settings/categories", label: "หมวดหมู่", icon: FolderTree },
  { to: "/settings/vat", label: "VAT", icon: Percent },
  { to: "/settings/tags", label: "Tag", icon: Tag },
  { to: "/settings/general", label: "ทั่วไป", icon: SettingsIcon },
];

export function SettingsNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isPlatformOwner } = useIsPlatformOwner();
  const visible = isPlatformOwner
    ? [...items, { to: "/settings/organizations", label: "องค์กร", icon: Network }]
    : items;
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto rounded-lg border bg-card p-1 sm:mx-0 sm:flex-wrap sm:overflow-visible">
      {visible.map((it) => {
        const active = it.exact ? pathname === it.to || pathname === "/settings/" : pathname.startsWith(it.to);
        return (
          <Link
            key={it.to}
            to={it.to as "/settings"}
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
