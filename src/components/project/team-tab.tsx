import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPlus, Trash2, Loader2, Users, ShieldCheck } from "lucide-react";
import { PermissionEditorDialog } from "@/components/project/permission-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/page-header";
import { getSupabase } from "@/lib/supabase";

type Member = {
  id: string;
  user_id: string;
  profiles?: { full_name: string | null; email: string | null } | null;
  perm_count: number;
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

  const { data: members, isLoading } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: async () => {
      const { data, error } = await sb
        .from("project_members")
        .select("id, user_id, profiles(full_name, email)")
        .eq("project_id", projectId);
      if (error) throw error;
      const ids = (data ?? []).map((m) => m.id);
      const { data: perms } = await sb
        .from("project_member_permissions")
        .select("project_member_id")
        .in("project_member_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const counts = new Map<string, number>();
      (perms ?? []).forEach((p) => counts.set(p.project_member_id, (counts.get(p.project_member_id) ?? 0) + 1));
      return ((data ?? []) as unknown as Member[]).map((m) => ({
        ...m,
        perm_count: counts.get(m.id) ?? 0,
      }));
    },
  });

  const { data: templates } = useQuery({
    queryKey: ["permission-templates"],
    queryFn: async () => {
      const { data } = await sb.from("permission_templates").select("id, template_name, permissions");
      return data ?? [];
    },
  });

  const { data: allUsers } = useQuery({
    queryKey: ["all-users-basic"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await sb.from("profiles").select("id, full_name, email").eq("is_active", true).order("full_name");
      return data ?? [];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("project_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ลบสมาชิกเรียบร้อย");
      qc.invalidateQueries({ queryKey: ["project-members", projectId] });
    },
  });

  const add = useMutation({
    mutationFn: async ({ userId, templateId }: { userId: string; templateId: string }) => {
      const tpl = templates?.find((t) => t.id === templateId);
      const perms = (tpl?.permissions ?? []) as string[];
      const { data: inserted, error } = await sb
        .from("project_members")
        .insert({ project_id: projectId, user_id: userId })
        .select("id")
        .single();
      if (error) throw error;
      if (perms.length > 0) {
        await sb.from("project_member_permissions").insert(
          perms.map((k) => ({ project_member_id: inserted.id, permission_key: k, granted: true })),
        );
      }
    },
    onSuccess: () => {
      toast.success("เพิ่มสมาชิกและสิทธิ์เรียบร้อย");
      qc.invalidateQueries({ queryKey: ["project-members", projectId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const memberUserIds = new Set((members ?? []).map((m) => m.user_id));
  const availableUsers = (allUsers ?? []).filter((u) => !memberUserIds.has(u.id));

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><UserPlus className="mr-2 h-4 w-4" />เพิ่มสมาชิก</Button>
            </DialogTrigger>
            <AddMemberDialog
              users={availableUsers}
              templates={templates ?? []}
              onCancel={() => setOpen(false)}
              onAdd={(userId, templateId) => add.mutate({ userId, templateId })}
              saving={add.isPending}
            />
          </Dialog>
        </div>
      )}

      {!isAdmin && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถเพิ่ม/ลบสมาชิกและปรับสิทธิ์
        </div>
      )}

      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">กำลังโหลด...</div>
      ) : !members || members.length === 0 ? (
        <EmptyState icon={Users} title="ยังไม่มีสมาชิกในโครงการ" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {members.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {(m.profiles?.full_name || m.profiles?.email || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{m.profiles?.full_name || "-"}</div>
                  <div className="truncate text-xs text-muted-foreground">{m.profiles?.email}</div>
                </div>
                <Badge variant="outline">{m.perm_count} สิทธิ์</Badge>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => confirm("ลบสมาชิกออกจากโครงการ?") && remove.mutate(m.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AddMemberDialog({
  users,
  templates,
  onCancel,
  onAdd,
  saving,
}: {
  users: { id: string; full_name: string | null; email: string | null }[];
  templates: { id: string; template_name: string }[];
  onCancel: () => void;
  onAdd: (userId: string, templateId: string) => void;
  saving: boolean;
}) {
  const [userId, setUserId] = useState("");
  const [templateId, setTemplateId] = useState("");

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
        <div>
          <Label>Template สิทธิ์</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger><SelectValue placeholder="เลือก Template" /></SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.template_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">สามารถปรับสิทธิ์รายบุคคลได้ในภายหลัง (Milestone D)</p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>ยกเลิก</Button>
        <Button onClick={() => onAdd(userId, templateId)} disabled={!userId || !templateId || saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}เพิ่ม
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
