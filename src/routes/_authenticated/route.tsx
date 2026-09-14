import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ensureSupabase } from "@/lib/supabase";
import { AppShell } from "@/components/app-shell";

type AccountStatus = "ok" | "inactive" | "pending";
const STATUS_TTL_MS = 60_000;
let statusCache: { userId: string; status: AccountStatus; at: number } | null = null;

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const sb = await ensureSupabase();
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    const user = data.session.user;

    // บัญชีถูกปิด หรือยังไม่ถูกเพิ่มเข้าองค์กร → ออกจากระบบ (DB ก็ตัดสิทธิ์อยู่แล้ว ส่วนนี้เพื่อ UX)
    let status = statusCache?.userId === user.id && Date.now() - statusCache.at < STATUS_TTL_MS
      ? statusCache.status
      : null;
    if (!status) {
      const [{ data: profile }, { data: roles }] = await Promise.all([
        sb.from("profiles").select("is_active, organization_id").eq("id", user.id).maybeSingle(),
        sb.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      const p = profile as { is_active: boolean | null; organization_id: string | null } | null;
      const roleList = ((roles ?? []) as { role: string }[]).map((r) => r.role);
      status = !p?.is_active
        ? "inactive"
        : roleList.length === 0 || (!p.organization_id && !roleList.includes("platform_owner"))
          ? "pending"
          : "ok";
      statusCache = { userId: user.id, status, at: Date.now() };
    }
    if (status !== "ok") {
      statusCache = null;
      await sb.auth.signOut();
      throw redirect({ to: "/auth", search: { reason: status } });
    }

    return { user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
