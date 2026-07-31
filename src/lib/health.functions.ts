import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const recomputeProjectHealth = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ projectId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("update_project_health", { _project_id: data.projectId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const scanDueDateNotifications = createServerFn({ method: "POST" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("scan_due_date_notifications");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
