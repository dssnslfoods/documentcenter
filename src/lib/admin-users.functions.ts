import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof getSupabaseAdmin>;

/** Verify the caller's access token belongs to a super_admin / platform_owner. */
async function requireAdmin(sb: Admin, accessToken: string) {
  const { data, error } = await sb.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("ไม่ได้เข้าสู่ระบบ");
  const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", data.user.id);
  const list = (roles ?? []).map((r: { role: string }) => r.role);
  if (!list.includes("super_admin") && !list.includes("platform_owner")) {
    throw new Error("เฉพาะผู้ดูแลระบบสูงสุดเท่านั้น");
  }
  return data.user;
}

export const adminUpdateUser = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        accessToken: z.string().min(10),
        userId: z.string().uuid(),
        email: z.string().email().optional(),
        fullName: z.string().max(200).optional(),
        phone: z.string().max(50).optional(),
        position: z.string().max(200).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const sb = getSupabaseAdmin();
    await requireAdmin(sb, data.accessToken);

    if (data.email) {
      const { error } = await sb.auth.admin.updateUserById(data.userId, {
        email: data.email,
        email_confirm: true,
      });
      if (error) throw new Error(error.message);
    }

    const patch: Record<string, string | null> = {};
    if (data.email !== undefined) patch.email = data.email;
    if (data.fullName !== undefined) patch.full_name = data.fullName || null;
    if (data.phone !== undefined) patch.phone = data.phone || null;
    if (data.position !== undefined) patch.position = data.position || null;
    if (Object.keys(patch).length) {
      const { error } = await sb.from("profiles").update(patch).eq("id", data.userId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        accessToken: z.string().min(10),
        userId: z.string().uuid(),
        password: z.string().min(8).max(72),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const sb = getSupabaseAdmin();
    await requireAdmin(sb, data.accessToken);
    const { error } = await sb.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
