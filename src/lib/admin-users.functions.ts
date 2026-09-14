import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/server-auth";

/**
 * Caller must be super_admin of the target's organization, or platform_owner.
 * Only a platform_owner may act on a platform_owner account.
 */
async function requireAdminOver(accessToken: string, targetUserId: string) {
  const caller = await requireUser(accessToken);
  const isPlatformOwner = caller.roles.includes("platform_owner");
  if (!isPlatformOwner && !caller.roles.includes("super_admin")) {
    throw new Error("เฉพาะผู้ดูแลระบบสูงสุดเท่านั้น");
  }

  // อ่านผ่าน client ของผู้เรียก — RLS จะไม่คืนผู้ใช้ข้ามองค์กร
  const [{ data: target }, { data: targetRoles }] = await Promise.all([
    caller.sb.from("profiles").select("id, organization_id").eq("id", targetUserId).maybeSingle(),
    caller.sb.from("user_roles").select("role").eq("user_id", targetUserId),
  ]);
  const t = target as { id: string; organization_id: string | null } | null;
  if (!t) throw new Error("ไม่พบผู้ใช้ หรือคุณไม่มีสิทธิ์จัดการผู้ใช้นี้");

  if (!isPlatformOwner) {
    if (!t.organization_id || t.organization_id !== caller.organizationId) {
      throw new Error("จัดการได้เฉพาะผู้ใช้ในองค์กรของคุณ");
    }
    if (((targetRoles ?? []) as { role: string }[]).some((r) => r.role === "platform_owner")) {
      throw new Error("ไม่สามารถแก้ไขบัญชีผู้ดูแลแพลตฟอร์มได้");
    }
  }
  return caller;
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
    const caller = await requireAdminOver(data.accessToken, data.userId);

    if (data.email) {
      const { error } = await getSupabaseAdmin().auth.admin.updateUserById(data.userId, {
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
      const { error } = await caller.sb.from("profiles").update(patch).eq("id", data.userId);
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
    await requireAdminOver(data.accessToken, data.userId);
    const { error } = await getSupabaseAdmin().auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
