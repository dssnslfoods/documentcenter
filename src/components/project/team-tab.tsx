import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPlus, Trash2, Loader2, Users, ShieldCheck, Pencil } from "lucide-react";
import { PermissionEditorDialog } from "@/components/project/permission-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/page-header";
import { getSupabase } from "@/lib/supabase";
import {
  PROJECT_ROLES, PROJECT_ROLE_DESC, PROJECT_ROLE_LABEL, ROLE_PERMISSIONS,
  type ProjectRole,
} from "@/lib/project-roles";

type Member = {
  id: string;
  user_id: string;
  project_role: ProjectRole;
  role_title: string | null;
  responsibilities: string | null;
  profiles?: { full_name: string | null; email: string | null } | null;
  perm_count: number;
  is_owner?: boolean;
};

export function TeamTab({
  projectId,
  isAdmin = false,
}: {
  projectId: string;
  isAdmin?: boolean;
}) {
  const sb = getSupabase();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editMember, setEditMember] = useState<{ id: string; label: string } | null>(null);
  const [editRole, setEditRole] = useState<Member | null>(null);

  const { data: members, isLoading, error } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: async () => {
      // Ensure the project owner/creator is always an executive team member
      const { data: project } = await sb
        .from("projects")
        .select("owner_id, created_by")
        .eq("id", projectId)
        .maybeSingle();
      const ownerId = (project?.owner_id ?? project?.created_by ?? null) as string | null;

      const load = async () => {
        const { data, error } = await sb
          .from("project_members")
          .select("id, user_id, project_role, role_title, responsibilities")
          .eq("project_id", projectId);
        if (error) throw error;
        return data ?? [];
      };

      let rows = await load();

      if (ownerId && !rows.some((r) => r.user_id === ownerId)) {
        const { data: created } = await sb
          .from("project_members")
          .insert({ project_id: projectId, user_id: ownerId, added_by: ownerId, project_role: "exec" })
          .select("id")
          .maybeSingle();
        if (created?.id) {
          await sb.from("project_member_permissions").insert(
            ROLE_PERMISSIONS.exec.map((k) => ({ project_member_id: created.id, permission_key: k, granted: true })),
          );
          rows = await load();
        }
      }

      const userIds = rows.map((r) => r.user_id);
      const { data: profiles } = userIds.length
        ? await sb.from("profiles").select("id, full_name, email").in("id", userIds)
        : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
      const pMap = new Map((profiles ?? []).map((p) => [p.id, p]));

      const ids = rows.map((m) => m.id);
      const { data: perms } = ids.length
        ? await sb.from("project_member_permissions").select("project_member_id").in("project_member_id", ids)
        : { data: [] as { project_member_id: string }[] };
      const counts = new Map<string, number>();
      (perms ?? []).forEach((p) => counts.set(p.project_member_id, (counts.get(p.project_member_id) ?? 0) + 1));

      return rows.map((m) => ({
        id: m.id,
        user_id: m.user_id,
        project_role: ((m as { project_role?: string }).project_role ?? "staff") as ProjectRole,
        role_title: (m as { role_title?: string | null }).role_title ?? null,
        responsibilities: (m as { responsibilities?: string | null }).responsibilities ?? null,
        profiles: pMap.get(m.user_id) ?? null,
        perm_count: counts.get(m.id) ?? 0,
        is_owner: !!ownerId && m.user_id === ownerId,
      })) as Member[];
    },
  });

  const { data: allUsers } = useQuery({
    queryKey: ["all-users-with-roles"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await sb.from("profiles").select("id, full_name, email").eq("is_active", true).order("full_name");
      const { data: roles } = await sb.from("user_roles").select("user_id, role");
      const roleMap = new Map<string, string[]>();
      (roles ?? []).forEach((r: { user_id: string; role: string }) => {
        roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
      });
      return (data ?? []).map((u) => ({ ...u, roles: roleMap.get(u.id) ?? [] }));
    },
  });

  const execCount = (members ?? []).filter((m) => m.project_role === "exec").length;

  const remove = useMutation({
    mutationFn: async (m: Member) => {
      if (m.project_role === "exec" && execCount <= 1) {
        throw new Error("โครงการต้องมีผู้บริหารโครงการอย่างน้อย 1 คน");
      }
      const { error } = await sb.from("project_members").delete().eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ลบสมาชิกเรียบร้อย");
      qc.invalidateQueries({ queryKey: ["project-members", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const add = useMutation({
    mutationFn: async ({
      userId,
      projectRole,
      roleTitle,
      responsibilities,
    }: { userId: string; projectRole: ProjectRole; roleTitle: string; responsibilities: string }) => {
      const { data: inserted, error } = await sb
        .from("project_members")
        .insert({
          project_id: projectId,
          user_id: userId,
          project_role: projectRole,
          role_title: roleTitle.trim() || null,
          responsibilities: responsibilities.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const perms = ROLE_PERMISSIONS[projectRole];
      if (perms.length > 0) {
        await sb.from("project_member_permissions").insert(
          perms.map((k) => ({ project_member_id: inserted.id, permission_key: k, granted: true })),
        );
      }
    },
    onSuccess: () => {
      toast.success("เพิ่มสมาชิกและสิทธิ์เรียบร้อย");
      qc.invalidateQueries({ queryKey: ["project-members", projectId] });
      qc.invalidateQueries({ queryKey: ["project-perms", projectId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRole = useMutation({
    mutationFn: async ({
      member, projectRole, roleTitle, responsibilities,
    }: { member: Member; projectRole: ProjectRole; roleTitle: string; responsibilities: string }) => {
      if (member.project_role === "exec" && projectRole !== "exec" && execCount <= 1) {
        throw new Error("โครงการต้องมีผู้บริหารโครงการอย่างน้อย 1 คน");
      }
      const { error } = await sb
        .from("project_members")
        .update({
          project_role: projectRole,
          role_title: roleTitle.trim() || null,
          responsibilities: responsibilities.trim() || null,
        })
        .eq("id", member.id);
      if (error) throw error;

      if (projectRole !== member.project_role) {
        await sb.from("project_member_permissions").delete().eq("project_member_id", member.id);
        await sb.from("project_member_permissions").insert(
          ROLE_PERMISSIONS[projectRole].map((k) => ({
            project_member_id: member.id, permission_key: k, granted: true,
          })),
        );
      }
    },
    onSuccess: () => {
      toast.success("บันทึกบทบาทและหน้าที่เรียบร้อย");
      qc.invalidateQueries({ queryKey: ["project-members", projectId] });
      qc.invalidateQueries({ queryKey: ["project-perms", projectId] });
      setEditRole(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const memberUserIds = new Set((members ?? []).map((m) => m.user_id));
  const availableUsers = (allUsers ?? []).filter((u) => !memberUserIds.has(u.id));

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">บทบาทในโครงการ:</span>{" "}
        {PROJECT_ROLES.map((r) => `${PROJECT_ROLE_LABEL[r]} — ${PROJECT_ROLE_DESC[r]}`).join(" · ")}
      </div>

      {isAdmin ? (
        <div className="flex items-center justify-between gap-3">
          {execCount === 0 && (
            <div className="text-xs font-medium text-destructive">
              โครงการนี้ยังไม่มีผู้บริหารโครงการ กรุณากำหนดอย่างน้อย 1 คน
            </div>
          )}
          <div className="ml-auto">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><UserPlus className="mr-2 h-4 w-4" />เพิ่มสมาชิก</Button>
              </DialogTrigger>
              <AddMemberDialog
                users={availableUsers}
                onCancel={() => setOpen(false)}
                onAdd={(userId, projectRole, roleTitle, responsibilities) =>
                  add.mutate({ userId, projectRole, roleTitle, responsibilities })
                }
                saving={add.isPending}
              />
            </Dialog>
          </div>
        </div>
      ) : (
        <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          โหมดดูอย่างเดียว — คุณสามารถดูรายชื่อสมาชิกโครงการและตำแหน่ง/หน้าที่ของแต่ละท่านได้
          แต่การเพิ่ม/ลบสมาชิกและปรับสิทธิ์ทำได้เฉพาะผู้บริหารโครงการเท่านั้น
        </div>
      )}

      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">กำลังโหลด...</div>
      ) : error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          โหลดรายชื่อสมาชิกไม่สำเร็จ: {(error as Error).message}
        </div>
      ) : !members || members.length === 0 ? (
        <EmptyState icon={Users} title="ยังไม่มีสมาชิกในโครงการ" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {members.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex items-start gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {(m.profiles?.full_name || m.profiles?.email || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{m.profiles?.full_name || m.profiles?.email || m.user_id.slice(0, 8)}</span>
                    <Badge variant={m.project_role === "exec" ? "default" : "secondary"} className="shrink-0">
                      {PROJECT_ROLE_LABEL[m.project_role]}
                    </Badge>
                    {m.is_owner && <Badge variant="outline" className="shrink-0">ผู้สร้างโครงการ</Badge>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{m.profiles?.email}</div>
                  {m.role_title && (
                    <div className="mt-1 text-xs font-medium text-primary">{m.role_title}</div>
                  )}
                  {m.responsibilities && (
                    <div className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{m.responsibilities}</div>
                  )}
                </div>
                {isAdmin && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEditRole(m)} title="แก้ไขบทบาท/หน้าที่">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {m.project_role === "exec" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditMember({ id: m.id, label: m.profiles?.full_name || m.profiles?.email || "-" })}
                        title="แก้ไขสิทธิ์"
                      >
                        <ShieldCheck className="h-4 w-4" />
                      </Button>
                    )}
                    {!m.is_owner && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => confirm("ลบสมาชิกออกจากโครงการ?") && remove.mutate(m)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PermissionEditorDialog
        open={!!editMember}
        onOpenChange={(v) => !v && setEditMember(null)}
        projectMemberId={editMember?.id ?? null}
        memberLabel={editMember?.label ?? ""}
      />

      <Dialog open={!!editRole} onOpenChange={(v) => !v && setEditRole(null)}>
        {editRole && (
          <RoleDialog
            member={editRole}
            canBeExec={
              !!(allUsers ?? []).find((u) => u.id === editRole.user_id)?.roles.some((r) =>
                r === "super_admin" || r === "management",
              ) || editRole.project_role === "exec"
            }
            saving={updateRole.isPending}
            onCancel={() => setEditRole(null)}
            onSave={(projectRole, roleTitle, responsibilities) =>
              updateRole.mutate({ member: editRole, projectRole, roleTitle, responsibilities })
            }
          />
        )}
      </Dialog>
    </div>
  );
}

function RoleDialog({
  member,
  canBeExec,
  saving,
  onCancel,
  onSave,
}: {
  member: Member;
  canBeExec: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: (projectRole: ProjectRole, roleTitle: string, responsibilities: string) => void;
}) {
  const [projectRole, setProjectRole] = useState<ProjectRole>(member.project_role);
  const [roleTitle, setRoleTitle] = useState(member.role_title ?? "");
  const [responsibilities, setResponsibilities] = useState(member.responsibilities ?? "");

  useEffect(() => {
    setProjectRole(member.project_role);
    setRoleTitle(member.role_title ?? "");
    setResponsibilities(member.responsibilities ?? "");
  }, [member]);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>บทบาทและหน้าที่ — {member.profiles?.full_name || member.profiles?.email || "-"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <RoleSelect value={projectRole} onChange={setProjectRole} canBeExec={canBeExec} />
        <div>
          <Label>ชื่อตำแหน่ง</Label>
          <Input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="เช่น ผู้จัดการโครงการ" />
        </div>
        <div>
          <Label>หน้าที่รับผิดชอบ</Label>
          <Textarea
            rows={3}
            value={responsibilities}
            onChange={(e) => setResponsibilities(e.target.value)}
            placeholder="เช่น ควบคุมแผนงาน ติดตามงวดงาน ประสานงานลูกค้า"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>ยกเลิก</Button>
        <Button onClick={() => onSave(projectRole, roleTitle, responsibilities)} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}บันทึก
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function RoleSelect({
  value,
  onChange,
  canBeExec,
}: {
  value: ProjectRole | "";
  onChange: (v: ProjectRole) => void;
  canBeExec: boolean;
}) {
  return (
    <div>
      <Label>บทบาทในโครงการ</Label>
      <Select value={value} onValueChange={(v) => onChange(v as ProjectRole)}>
        <SelectTrigger><SelectValue placeholder="เลือกบทบาท" /></SelectTrigger>
        <SelectContent>
          {PROJECT_ROLES.map((r) => (
            <SelectItem key={r} value={r} disabled={r === "exec" && !canBeExec}>
              {PROJECT_ROLE_LABEL[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="mt-1 text-xs text-muted-foreground">
        {value ? PROJECT_ROLE_DESC[value] : "ผู้บริหารโครงการต้องมีบทบาทระบบเป็นผู้ดูแลระบบสูงสุดหรือผู้บริหาร"}
      </p>
    </div>
  );
}

function AddMemberDialog({
  users,
  onCancel,
  onAdd,
  saving,
}: {
  users: { id: string; full_name: string | null; email: string | null; roles: string[] }[];
  onCancel: () => void;
  onAdd: (userId: string, projectRole: ProjectRole, roleTitle: string, responsibilities: string) => void;
  saving: boolean;
}) {
  const [userId, setUserId] = useState("");
  const [projectRole, setProjectRole] = useState<ProjectRole | "">("");
  const [roleTitle, setRoleTitle] = useState("");
  const [responsibilities, setResponsibilities] = useState("");

  const selected = users.find((u) => u.id === userId);
  const canBeExec = !!selected?.roles.some((r) => r === "super_admin" || r === "management");

  useEffect(() => {
    if (projectRole === "exec" && !canBeExec) setProjectRole("");
  }, [canBeExec, projectRole]);

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>เพิ่มสมาชิกโครงการ</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>ผู้ใช้งาน</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger><SelectValue placeholder="เลือกผู้ใช้" /></SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <RoleSelect value={projectRole} onChange={setProjectRole} canBeExec={canBeExec} />
        <div>
          <Label>ชื่อตำแหน่ง</Label>
          <Input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="เช่น ผู้จัดการโครงการ" />
        </div>
        <div>
          <Label>หน้าที่รับผิดชอบ</Label>
          <Textarea
            rows={3}
            value={responsibilities}
            onChange={(e) => setResponsibilities(e.target.value)}
            placeholder="เช่น ควบคุมแผนงาน ติดตามงวดงาน ประสานงานลูกค้า"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>ยกเลิก</Button>
        <Button
          onClick={() => projectRole && onAdd(userId, projectRole, roleTitle, responsibilities)}
          disabled={!userId || !projectRole || saving}
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}เพิ่ม
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
