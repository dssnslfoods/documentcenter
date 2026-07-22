import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSupabase } from "@/lib/supabase";
import { ALL_PERMISSIONS, PERMISSION_LABEL, type PermissionKey } from "@/hooks/use-project-permissions";

export function PermissionEditorDialog({
  open,
  onOpenChange,
  projectMemberId,
  memberLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectMemberId: string | null;
  memberLabel: string;
}) {
  const sb = getSupabase();
  const qc = useQueryClient();
  const [checked, setChecked] = useState<Set<PermissionKey>>(new Set());
  const [templateId, setTemplateId] = useState<string>("");

  const { data: current, isLoading } = useQuery({
    queryKey: ["member-perms", projectMemberId],
    enabled: open && !!projectMemberId,
    queryFn: async () => {
      const { data } = await sb
        .from("project_member_permissions")
        .select("permission_key, granted")
        .eq("project_member_id", projectMemberId!);
      return data ?? [];
    },
  });

  const { data: templates } = useQuery({
    queryKey: ["permission-templates"],
    queryFn: async () => {
      const { data } = await sb.from("permission_templates").select("id, template_name, permissions");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (current) {
      const s = new Set<PermissionKey>();
      current.forEach((p) => {
        if (p.granted) s.add(p.permission_key as PermissionKey);
      });
      setChecked(s);
    }
  }, [current]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = templates?.find((t) => t.id === id);
    if (!tpl) return;
    setChecked(new Set((tpl.permissions as PermissionKey[]) ?? []));
  };

  const toggle = (k: PermissionKey) => {
    const s = new Set(checked);
    if (s.has(k)) s.delete(k);
    else s.add(k);
    setChecked(s);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!projectMemberId) return;
      await sb.from("project_member_permissions").delete().eq("project_member_id", projectMemberId);
      const rows = Array.from(checked).map((k) => ({
        project_member_id: projectMemberId,
        permission_key: k,
        granted: true,
      }));
      if (rows.length) {
        const { error } = await sb.from("project_member_permissions").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("บันทึกสิทธิ์เรียบร้อย");
      qc.invalidateQueries({ queryKey: ["project-members"] });
      qc.invalidateQueries({ queryKey: ["project-perms"] });
      qc.invalidateQueries({ queryKey: ["member-perms", projectMemberId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            สิทธิ์ของ {memberLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Apply Template</Label>
            <Select value={templateId} onValueChange={applyTemplate}>
              <SelectTrigger><SelectValue placeholder="เลือก Template (จะแทนที่ทั้งหมด)" /></SelectTrigger>
              <SelectContent>
                {(templates ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.template_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">กำลังโหลด...</div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 max-h-[50vh] overflow-y-auto rounded-md border p-3">
              {ALL_PERMISSIONS.map((k) => (
                <label key={k} className="flex items-center gap-2 rounded-md p-1.5 hover:bg-muted/60 cursor-pointer">
                  <Checkbox checked={checked.has(k)} onCheckedChange={() => toggle(k)} />
                  <span className="text-sm">{PERMISSION_LABEL[k]}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !projectMemberId}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}บันทึกสิทธิ์
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
