import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.EXTERNAL_SUPABASE_URL!,
    process.env.EXTERNAL_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export default defineTool({
  name: "list_contracts",
  title: "List contracts",
  description:
    "List contracts visible to the signed-in user (respects row-level security). Optionally filter by status or by contracts expiring within N days.",
  inputSchema: {
    status: z
      .enum(["draft", "active", "expiring_soon", "expired", "terminated", "renewed"])
      .optional()
      .describe("Filter by contract status."),
    expiring_within_days: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe("Only include contracts whose end_date falls within this many days from today."),
    limit: z.number().int().min(1).max(50).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, expiring_within_days, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("contracts")
      .select("id, contract_no, title, status, start_date, end_date, value_amount, currency")
      .order("end_date", { ascending: true })
      .limit(limit ?? 20);
    if (status) q = q.eq("status", status);
    if (expiring_within_days) {
      const today = new Date();
      const cutoff = new Date(today.getTime() + expiring_within_days * 86400_000);
      q = q.lte("end_date", cutoff.toISOString().slice(0, 10)).gte("end_date", today.toISOString().slice(0, 10));
    }
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { contracts: data ?? [] },
    };
  },
});
