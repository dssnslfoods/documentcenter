import { type ReactNode, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, FileText, FileSignature, FileSpreadsheet,
  Users, FolderKanban, Calendar, Bell, BarChart3, History, Settings,
  Search, LogOut, User as UserIcon, Menu, X, ChevronDown, PanelLeftClose, PanelLeftOpen,
  Building2, ShieldCheck, LayoutGrid,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { OrgSwitcher } from "@/components/org-switcher";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-supabase";
import { useCanAccess } from "@/hooks/use-page-access";
import { ROLES, type PageKey } from "@/lib/pages";
import { useIsPlatformOwner } from "@/lib/org";

// Sidebar organized by workflow order: daily work → sales pipeline → post-sale docs → governance
type NavItem = { to: string; icon: React.ComponentType<{ className?: string }>; label: string; key: PageKey };
type NavSection = { label: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    label: "งานประจำวัน",
    items: [
      { to: "/dashboard", icon: LayoutDashboard, label: "ภาพรวม", key: "dashboard" },
      { to: "/calendar", icon: Calendar, label: "ปฏิทิน", key: "calendar" },
      { to: "/notifications", icon: Bell, label: "การแจ้งเตือน", key: "notifications" },
    ],
  },
  {
    label: "งานขายและโครงการ",
    items: [
      { to: "/projects", icon: FolderKanban, label: "โครงการ", key: "projects" },
      { to: "/quotations", icon: FileSpreadsheet, label: "ใบเสนอราคา", key: "quotations" },
      
      { to: "/partners", icon: Users, label: "คู่ค้าและลูกค้า", key: "partners" },
    ],
  },
  {
    label: "เอกสารและสัญญา",
    items: [
      { to: "/documents", icon: FileText, label: "คลังเอกสาร", key: "documents" },
      { to: "/contracts", icon: FileSignature, label: "สัญญา", key: "contracts" },
    ],
  },
  {
    label: "กำกับและควบคุม",
    items: [
      
      { to: "/reports", icon: BarChart3, label: "รายงาน", key: "reports" },
      { to: "/audit-log", icon: History, label: "Audit Log", key: "audit-log" },
      { to: "/settings", icon: Settings, label: "ตั้งค่าระบบ", key: "settings" },
    ],
  },
];

// โซนผู้ดูแลแพลตฟอร์ม — แสดงเฉพาะเมนูบริหารองค์กรเท่านั้น
const PLATFORM_SECTIONS: NavSection[] = [
  {
    label: "ผู้ดูแลแพลตฟอร์ม",
    items: [
      { to: "/platform", icon: Building2, label: "องค์กร", key: "organizations" },
      { to: "/platform/admins", icon: ShieldCheck, label: "ผู้ดูแลองค์กร", key: "organizations" },
      { to: "/platform/menus", icon: LayoutGrid, label: "เมนูขององค์กร", key: "organizations" },
    ],
  },
];

function useProfileName(userId: string | undefined) {
  const { data } = useQuery({
    queryKey: ["sidebar-profile", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await getSupabase()
        .from("profiles")
        .select("full_name, position")
        .eq("id", userId)
        .maybeSingle();
      return data;
    },
    enabled: !!userId,
  });
  return data;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user } = useAuth();
  const profile = useProfileName(user?.id);
  const { can, roles } = useCanAccess();
  const { isPlatformOwner } = useIsPlatformOwner();
  const roleLabel =
    roles.map((r) => ROLES.find((x) => x.value === r)?.label ?? r).join(" · ") || null;
  const displayName =
    profile?.full_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "ผู้ใช้งาน";

  const signOut = async () => {
    await getSupabase().auth.signOut();
    toast.success("ออกจากระบบแล้ว");
    navigate({ to: "/auth" });
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ${
          collapsed ? "w-[68px]" : "w-64"
        }`}
      >
        <SidebarContent
          collapsed={collapsed}
          pathname={pathname}
          displayName={displayName}
          email={user?.email}
          position={profile?.position ?? null}
          roleLabel={roleLabel}
          can={can}
          isPlatformOwner={isPlatformOwner}
        />
      </aside>


      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-2 top-3 rounded-md p-1.5 hover:bg-sidebar-accent"
              aria-label="ปิดเมนู"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent
              collapsed={false}
              pathname={pathname}
              displayName={displayName}
              email={user?.email}
              position={profile?.position ?? null}
              roleLabel={roleLabel}
              can={can}
              isPlatformOwner={isPlatformOwner}

            />

          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-1.5 border-b bg-card/80 px-2 backdrop-blur sm:gap-3 sm:px-4">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 hover:bg-muted lg:hidden"
            aria-label="เปิดเมนู"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="hidden rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground lg:inline-flex"
            aria-label="Toggle sidebar"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>

          <form
            className="relative min-w-0 flex-1 max-w-xl"
            onSubmit={(e) => {
              e.preventDefault();
              const v = new FormData(e.currentTarget).get("q");
              const q = typeof v === "string" ? v.trim() : "";
              navigate({ to: "/search", search: { q: q || undefined } });
            }}
          >
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              placeholder="ค้นหา..."
              className="h-10 w-full rounded-full border-transparent bg-muted pl-9 text-sm focus-visible:border-ring focus-visible:bg-card"
            />
          </form>


          <NotificationBell userId={user?.id} />

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-muted">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {(user?.email ?? "?").charAt(0).toUpperCase()}
              </div>
              <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="text-sm font-medium">{user?.user_metadata?.full_name || "ผู้ใช้งาน"}</div>
                <div className="text-xs font-normal text-muted-foreground">{user?.email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/profile"><UserIcon className="mr-2 h-4 w-4" />โปรไฟล์</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />ออกจากระบบ
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="min-w-0 flex-1 p-3 sm:p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function NotificationBell({ userId }: { userId: string | undefined }) {
  const { data: count } = useQuery({
    queryKey: ["notifications-unread", userId],
    queryFn: async () => {
      if (!userId) return 0;
      const { count } = await getSupabase()
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);
      return count ?? 0;
    },
    enabled: !!userId,
    refetchInterval: 60_000,
  });
  return (
    <Link to="/notifications" className="relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Notifications">
      <Bell className="h-5 w-5" />
      {count && count > 0 ? (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}

function SidebarContent({
  collapsed, pathname, displayName, email, position, roleLabel, can,
}: {
  collapsed: boolean;
  pathname: string;
  displayName: string;
  email?: string;
  position?: string | null;
  roleLabel?: string | null;
  can: (key: PageKey) => boolean;
  isPlatformOwner?: boolean;
}) {
  const sections = isPlatformOwner
    ? PLATFORM_SECTIONS
    : NAV_SECTIONS
        .map((s) => ({ ...s, items: s.items.filter((i) => can(i.key)) }))
        .filter((s) => s.items.length > 0);
  return (
    <>
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-4">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <FileText className="h-4 w-4" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate font-display text-sm font-semibold tracking-tight">Document Hub</div>
            <div className="truncate text-[10px] text-muted-foreground">Contract & workflow</div>
          </div>
        )}
      </div>
      {!isPlatformOwner && <OrgSwitcher collapsed={collapsed} />}
      <nav className="flex-1 space-y-4 overflow-y-auto p-2 py-4">

        {sections.map((section) => (
          <div key={section.label} className="space-y-0.5">
            {!collapsed && (
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                {section.label}
              </div>
            )}
            {collapsed && <div className="mx-3 my-2 border-t border-sidebar-border/60" />}
            {section.items.map((item) => {
              const active = pathname === item.to || pathname.startsWith(item.to + "/");
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  {active && (
                    <span className="absolute left-0 top-1.5 h-[calc(100%-0.75rem)] w-0.5 rounded-r bg-primary" aria-hidden />
                  )}
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <Link
          to="/profile"
          className={`flex items-center gap-2.5 rounded-md p-2 transition-colors hover:bg-sidebar-accent ${collapsed ? "justify-center" : ""}`}
          title={collapsed ? displayName : undefined}
        >
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {displayName.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{displayName}</div>
              {roleLabel && (
                <div className="mt-0.5 inline-flex max-w-full truncate rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  {roleLabel}
                </div>
              )}
              <div className="truncate text-[10px] text-muted-foreground">{position || email}</div>
            </div>
          )}
        </Link>
        {!collapsed && (
          <div className="px-2 pt-2 text-[10px] text-muted-foreground">v0.2 · Cloud White</div>
        )}
      </div>

    </>
  );
}
