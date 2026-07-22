import { type ReactNode, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, FileText, FileSignature, FileSpreadsheet, ShoppingCart,
  Users, FolderKanban, Calendar, CheckSquare, Bell, BarChart3, History, Settings,
  Search, LogOut, User as UserIcon, Menu, X, ChevronDown,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-supabase";

const NAV = [
  { to: "/dashboard", icon: LayoutDashboard, label: "ภาพรวม" },
  { to: "/documents", icon: FileText, label: "คลังเอกสาร" },
  { to: "/contracts", icon: FileSignature, label: "สัญญา" },
  { to: "/quotations", icon: FileSpreadsheet, label: "ใบเสนอราคา" },
  { to: "/procurements", icon: ShoppingCart, label: "จัดซื้อและจัดจ้าง" },
  { to: "/partners", icon: Users, label: "คู่ค้าและลูกค้า" },
  { to: "/projects", icon: FolderKanban, label: "โครงการ" },
  { to: "/calendar", icon: Calendar, label: "ปฏิทินและกำหนดการ" },
  { to: "/approvals", icon: CheckSquare, label: "งานรออนุมัติ" },
  { to: "/notifications", icon: Bell, label: "การแจ้งเตือน" },
  { to: "/reports", icon: BarChart3, label: "รายงาน" },
  { to: "/audit-log", icon: History, label: "Audit Log" },
  { to: "/settings", icon: Settings, label: "ตั้งค่าระบบ" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user } = useAuth();

  const signOut = async () => {
    await getSupabase().auth.signOut();
    toast.success("ออกจากระบบแล้ว");
    navigate({ to: "/auth" });
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-sidebar text-sidebar-foreground transition-all ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        <SidebarContent collapsed={collapsed} pathname={pathname} />
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-sidebar text-sidebar-foreground">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-2 top-2 rounded p-1 hover:bg-sidebar-accent"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent collapsed={false} pathname={pathname} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-card px-4">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded p-2 hover:bg-muted lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="hidden rounded p-2 hover:bg-muted lg:inline-flex"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="ค้นหาเอกสาร สัญญา คู่ค้า..." className="pl-9" />
          </div>

          <NotificationBell userId={user?.id} />


          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-md p-1.5 hover:bg-muted">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
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

        <main className="min-w-0 flex-1 p-6">{children}</main>
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
    <Link to="/notifications" className="relative rounded p-2 hover:bg-muted" aria-label="Notifications">
      <Bell className="h-5 w-5" />
      {count && count > 0 ? (
        <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}

function SidebarContent({ collapsed, pathname }: { collapsed: boolean; pathname: string }) {
  return (
    <>
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <FileText className="h-4 w-4" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Document Hub</div>
            <div className="truncate text-[10px] opacity-70">บริหารเอกสารและสัญญา</div>
          </div>
        )}
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV.map((item) => {
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                  : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      {!collapsed && (
        <div className="border-t border-sidebar-border p-3 text-[10px] opacity-70">
          v0.1.0 · Phase 1+2
        </div>
      )}
    </>
  );
}
