import { createClient } from "@supabase/supabase-js";

/**
 * Privileged Supabase client using the service role key (bypasses RLS).
 * Server-only. Callers must verify the requesting user before using it.
 */
export function getSupabaseAdmin() {
  const url = process.env.EXTERNAL_SUPABASE_URL;
  const serviceKey = process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("EXTERNAL_SUPABASE_URL is not configured");
  if (!serviceKey) {
    throw new Error("ยังไม่ได้ตั้งค่า EXTERNAL_SUPABASE_SERVICE_ROLE_KEY บนเซิร์ฟเวอร์");
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
