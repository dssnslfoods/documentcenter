import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSupabase } from "@/lib/supabase";
import { PERMISSION_LABEL, type PermissionKey } from "@/hooks/use-project-permissions";

/** Permission groups mirroring the project detail tabs */
type TabGroup = {
  value: string;
  label: string;
  /** key that grants access to the tab */
  access: PermissionKey;
  /** extra options available once the tab is accessible */
  options: { key: PermissionKey; label: string }[];
};

const TAB_GROUPS: TabGroup[] = [
  {
    value: "overview",
    label: "1 · ภาพรวม",
    access: "view_project_info",
    options: [{ key: "edit_project", label: "แก้ไขข้อมูลโครงการ" }],
  },
  {
    value: "rfq",
    label: "2 · RFQ / Spec",
    access: "view_spec_scope",
    options: [],
  },
  {
    value: "supplier",
    label: "3 · ใบเสนอ Supplier",
    access: "view_supplier_quotation_no_price",
    options: [{ key: "view_supplier_quotation", label: "เห็นราคาของ Supplier" }],
  },
  {
    value: "customer",
    label: "4 · ยื่นข้อเสนอลูกค้า",
    access: "view_customer_quotation_no_price",
    options: [{ key: "view_customer_quotation", label: "เห็นราคาที่เสนอลูกค้า" }],
  },
  {
    value: "contract",
    label: "5 · สัญญา",
    access: "view_contract",
    options: [],
  },
  {
    value: "milestones",
    label: "6 · งวดงาน",
    access: "view_milestones_no_payment",
    options: [
      { key: "view_milestones", label: "เห็นยอดเงินแต่ละงวด" },
      { key: "edit_milestones", label: "แก้ไขงวดงาน" },
    ],
  },
  {
    value: "documents",
    label: "เอกสาร",
    access: "view_all_documents",
    options: [{ key: "upload_documents", label: "อัปโหลดเอกสาร" }],
  },
];

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
  const [active, setActive] = useState<string>(TAB_GROUPS[0].value);

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

  const hasAccess = (g: TabGroup) =>
    checked.has(g.access) || g.options.some((o) => o.key.startsWith("view_") && checked.has(o.key));

  const toggleAccess = (g: TabGroup, on: boolean) => {
    const s = new Set(checked);
    if (on) {
      s.add(g.access);
    } else {
      s.delete(g.access);
      g.options.forEach((o) => s.delete(o.key));
    }
    setChecked(s);
  };

  const toggleOption = (k: PermissionKey, g: TabGroup) => {
    const s = new Set(checked);
    if (s.has(k)) s.delete(k);
    else {
      s.add(k);
      s.add(g.access); // ensure tab access when granting an option
    }
    setChecked(s);
  };

  const allOn = () => {
    const s = new Set<PermissionKey>();
    TAB_GROUPS.forEach((g) => {
      s.add(g.access);
      g.options.forEach((o) => s.add(o.key));
    });
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
      <DialogContent className="w-[95vw] max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            สิทธิ์ของ {memberLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
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
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={allOn}>เลือกทุกแท็บ</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setChecked(new Set())}>ล้างทั้งหมด</Button>
            </div>
          </div>

          {isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">กำลังโหลด...</div>
          ) : (
            <Tabs value={active} onValueChange={setActive} className="min-w-0">
              <div className="w-full max-w-full overflow-x-auto pb-1">
                <TabsList className="inline-flex h-auto w-max flex-nowrap gap-1 rounded-full bg-muted p-1">
                  {TAB_GROUPS.map((g) => (
                    <TabsTrigger
                      key={g.value}
                      value={g.value}
                      className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm"
                    >
                      <span className="flex items-center gap-1">
                        {hasAccess(g) && <Check className="h-3 w-3 text-primary" />}
                        {g.label}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              {TAB_GROUPS.map((g) => (
                <TabsContent key={g.value} value={g.value} className="mt-4 w-full min-w-0">
                  <div className="w-full space-y-4 rounded-md border p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">ให้เข้าถึงแท็บ “{g.label}”</div>
                        <p className="text-xs text-muted-foreground">{PERMISSION_LABEL[g.access]}</p>
                      </div>
                      <Switch checked={hasAccess(g)} onCheckedChange={(v) => toggleAccess(g, v)} />
                    </div>

                    {g.options.length > 0 && (
                      <div className="space-y-2 border-t pt-3">
                        <div className="text-xs font-medium text-muted-foreground">สิทธิ์เพิ่มเติมในแท็บนี้</div>
                        {g.options.map((o) => (
                          <label
                            key={o.key}
                            className={`flex items-center gap-2 rounded-md p-1.5 text-sm hover:bg-muted/60 ${hasAccess(g) ? "cursor-pointer" : "opacity-50"}`}
                          >
                            <Checkbox
                              checked={checked.has(o.key)}
                              disabled={!hasAccess(g)}
                              onCheckedChange={() => toggleOption(o.key, g)}
                            />
                            <span>{o.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>แท็บที่เข้าถึงได้:</span>
            {TAB_GROUPS.filter(hasAccess).length === 0 ? (
              <span>ยังไม่ได้เลือก</span>
            ) : (
              TAB_GROUPS.filter(hasAccess).map((g) => (
                <Badge key={g.value} variant="secondary">{g.label}</Badge>
              ))
            )}
          </div>
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
