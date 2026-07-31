import { createFileRoute } from "@tanstack/react-router";
import { scanDueDateNotifications } from "@/lib/health.functions";

export const Route = createFileRoute("/api/public/cron/daily-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        const cronSecret = process.env["CRON_SECRET"];
        if (cronSecret && auth !== `Bearer ${cronSecret}`) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          await scanDueDateNotifications();
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: (e as Error).message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
