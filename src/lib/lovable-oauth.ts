import { ensureSupabase } from "@/lib/supabase";

export type AuthOAuth = {
  getAuthorizationDetails: (id: string) => Promise<{
    data: {
      client?: { name?: string; client_id?: string };
      redirect_uri?: string;
      scope?: string;
      redirect_url?: string;
      redirect_to?: string;
    } | null;
    error: { message: string } | null;
  }>;
  approveAuthorization: (id: string) => Promise<{
    data: { redirect_url?: string; redirect_to?: string } | null;
    error: { message: string } | null;
  }>;
  denyAuthorization: (id: string) => Promise<{
    data: { redirect_url?: string; redirect_to?: string } | null;
    error: { message: string } | null;
  }>;
};

export async function oauth(): Promise<AuthOAuth> {
  const sb = await ensureSupabase();
  return (sb.auth as unknown as { oauth: AuthOAuth }).oauth;
}
