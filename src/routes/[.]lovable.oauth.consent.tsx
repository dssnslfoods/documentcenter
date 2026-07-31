import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { ensureSupabase } from "@/lib/supabase";
import { oauth } from "@/lib/lovable-oauth";


export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const sb = await ensureSupabase();
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { redirect: next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const api = await oauth();
    const { data, error } = await api.getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">ไม่สามารถโหลดคำขออนุญาต</h1>
        <p className="mt-2 text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
      </div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = await oauth();
    const { data, error } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("ไม่ได้รับ redirect จากเซิร์ฟเวอร์อนุญาต");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "แอปพลิเคชันภายนอก";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">เชื่อมต่อ {clientName} กับบัญชีของคุณ</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          การอนุญาตนี้จะให้ <span className="font-medium text-foreground">{clientName}</span> เรียกใช้เครื่องมือของ Corporate Document &amp; Contract Hub ในนามของคุณ
          โดยยังอยู่ภายใต้สิทธิ์และนโยบายเดิมของระบบ (RLS)
        </p>
        {details?.scope && (
          <p className="mt-3 text-xs text-muted-foreground">Scope: {details.scope}</p>
        )}
        {error && <p role="alert" className="mt-4 rounded bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex gap-2">
          <button
            disabled={busy}
            onClick={() => decide(false)}
            className="flex-1 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            ปฏิเสธ
          </button>
          <button
            disabled={busy}
            onClick={() => decide(true)}
            className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            อนุญาต
          </button>
        </div>
      </div>
    </main>
  );
}
