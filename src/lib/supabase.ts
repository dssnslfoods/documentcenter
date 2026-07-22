import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase-config.functions";

let client: SupabaseClient | null = null;
let initPromise: Promise<SupabaseClient> | null = null;

export function initSupabase(url: string, anonKey: string): SupabaseClient {
  if (client) return client;
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}

export async function ensureSupabase(): Promise<SupabaseClient> {
  if (client) return client;
  if (!initPromise) {
    initPromise = (async () => {
      const cfg = await getSupabaseConfig();
      return initSupabase(cfg.url, cfg.anonKey);
    })();
  }
  return initPromise;
}

export function getSupabase(): SupabaseClient {
  if (!client) {
    throw new Error(
      "Supabase client not initialized. Ensure <SupabaseBootstrap> wraps the app.",
    );
  }
  return client;
}
