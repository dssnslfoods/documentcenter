import { createClient } from "@supabase/supabase-js";

/**
 * Create a privileged Supabase client using the service role key.
 * Falls back to the anon key if service role is not configured (not recommended
 * for production writes because RLS still applies to the anon key).
 */
export function getSupabaseAdmin() {
  const url = process.env.EXTERNAL_SUPABASE_URL;
  const serviceKey = process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.EXTERNAL_SUPABASE_ANON_KEY;

  if (!url) throw new Error("EXTERNAL_SUPABASE_URL is not configured");
  if (!serviceKey && !anonKey) {
    throw new Error("Neither EXTERNAL_SUPABASE_SERVICE_ROLE_KEY nor EXTERNAL_SUPABASE_ANON_KEY is configured");
  }

  return createClient(url, serviceKey ?? anonKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
