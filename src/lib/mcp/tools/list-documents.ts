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
  name: "list_documents",
  title: "List documents",
  description:
    "List documents visible to the signed-in user (respects row-level security). Optionally filter by keyword in title or document number.",
  inputSchema: {
    query: z
      .string()
      .trim()
      .optional()
      .describe("Optional keyword to match against title or document number."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Max rows to return (default 20, max 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("documents")
      .select("id, doc_number, title, status, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (query) {
      // ตัดอักขระที่เป็นไวยากรณ์ของ filter (, ( ) " \) ออก ไม่ให้ผู้เรียกแทรกเงื่อนไขเพิ่มเองได้
      const term = query.replace(/[,()"\\]/g, " ").trim();
      if (term) q = q.or(`title.ilike.%${term}%,doc_number.ilike.%${term}%`);
    }
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { documents: data ?? [] },
    };
  },
});
