import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const recomputeProjectHealth = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ projectId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const sb = getSupabaseAdmin();
    const { error } = await sb.rpc("update_project_health", { _project_id: data.projectId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const scanDueDateNotifications = createServerFn({ method: "POST" })
  .handler(async () => {
    const sb = getSupabaseAdmin();
    const { error } = await sb.rpc("scan_due_date_notifications");
    if (error) throw new Error(error.message);
    const { error: e2 } = await sb.rpc("scan_assignment_due_notifications");
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });
