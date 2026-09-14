import { createClient } from "@supabase/supabase-js";

/**
 * Server-side identity check for server functions.
 *
 * Supabase sessions live in the browser, so the client must pass its access token.
 * We verify the token with Supabase Auth and read the caller's own profile/roles
 * through a client scoped to that token — RLS applies, and no service-role key is needed.
 */
export async function requireUser(accessToken: string | undefined) {
  const url = process.env.EXTERNAL_SUPABASE_URL;
  const anonKey = process.env.EXTERNAL_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("ระบบยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล");
  if (!accessToken) throw new Error("กรุณาเข้าสู่ระบบ");

  const sb = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data, error } = await sb.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    sb.from("profiles").select("organization_id, is_active").eq("id", data.user.id).maybeSingle(),
    sb.from("user_roles").select("role").eq("user_id", data.user.id),
  ]);
  const p = profile as { organization_id: string | null; is_active: boolean | null } | null;
  if (!p?.is_active) throw new Error("บัญชีนี้ถูกปิดการใช้งาน");

  const roles = ((roleRows ?? []) as { role: string }[]).map((r) => r.role);
  if (!roles.length) throw new Error("บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน");

  return { user: data.user, sb, roles, organizationId: p.organization_id };
}
