import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase-config.functions";

/**
 * Create a NEW user via signUp, using a throwaway Supabase client that does NOT
 * persist a session, so the currently signed-in admin keeps their session.
 *
 * The database trigger `handle_new_user` creates the profile only — no organization
 * and no role (db/0057). The calling admin must then assign the organization and
 * role. Returns the new user's id.
 */
export async function adminInviteUser(input: {
  email: string;
  password: string;
  fullName?: string;
}): Promise<{ userId: string | null; needsConfirmation: boolean }> {
  const cfg = await getSupabaseConfig();
  const tmp = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await tmp.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.fullName ?? input.email },
    },
  });
  if (error) throw error;
  return {
    userId: data.user?.id ?? null,
    needsConfirmation: !data.session,
  };
}
