import { createServerFn } from "@tanstack/react-start";

/**
 * Returns the external Supabase URL + anon key to the browser.
 * Anon key is designed to be public; RLS enforces all authorization server-side.
 * We route through a server fn so URL/key are never hardcoded in source.
 */
export const getSupabaseConfig = createServerFn({ method: "GET" }).handler(async () => {
  const url = process.env.EXTERNAL_SUPABASE_URL;
  const anonKey = process.env.EXTERNAL_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "EXTERNAL_SUPABASE_URL / EXTERNAL_SUPABASE_ANON_KEY are not configured. Add them via Lovable secrets.",
    );
  }
  return { url, anonKey };
});
