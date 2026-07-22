import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ensureSupabase } from "@/lib/supabase";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const sb = await ensureSupabase();
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    return { user: data.session.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
