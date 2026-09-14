import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const Route = createFileRoute("/api/public/cron/daily-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env["CRON_SECRET"];
        // ไม่ตั้ง secret = ปิดการใช้งาน (เดิมข้ามการตรวจสิทธิ์ ทำให้ใครก็เรียกได้)
        if (!cronSecret) return json({ error: "CRON_SECRET is not configured" }, 503);
        if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const sb = getSupabaseAdmin();
          const { error } = await sb.rpc("scan_due_date_notifications");
          if (error) throw new Error(error.message);
          const { error: e2 } = await sb.rpc("scan_assignment_due_notifications");
          if (e2) throw new Error(e2.message);
          return json({ ok: true }, 200);
        } catch (e) {
          return json({ error: (e as Error).message }, 500);
        }
      },
    },
  },
});
